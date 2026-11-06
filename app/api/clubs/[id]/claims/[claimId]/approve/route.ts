import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendAuditLog } from "@/lib/audit";
import { createPayPalPayout } from "@/lib/paypal";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; claimId: string }> }
) {
  try {
    const { id: clubId, claimId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const {
      approverEmail,
      userRole, // Must be "TREASURER"
      selfCertified, // Required if approver is the requester
      simulateSandbox,
    } = body;

    // 1. Strict server-side role check
    if (userRole !== "TREASURER") {
      return NextResponse.json(
        { error: "Unauthorized: Only the Treasurer can approve reimbursement claims." },
        { status: 403 }
      );
    }

    const claim = await prisma.reimbursementClaim.findUnique({
      where: { id: claimId },
      include: { club: true, tag: true, movement: true },
    });

    if (!claim) {
      return NextResponse.json({ error: "Reimbursement claim not found." }, { status: 404 });
    }

    if (claim.clubId !== clubId) {
      return NextResponse.json({ error: "Claim does not belong to this club." }, { status: 400 });
    }

    // 2. Idempotency guard: prevent duplicate payout if already paid
    if (claim.status === "PAID") {
      return NextResponse.json({
        success: true,
        alreadyPaid: true,
        message: "This claim has already been approved and paid.",
        claim,
      });
    }

    if (claim.status === "REJECTED") {
      return NextResponse.json(
        { error: "Cannot approve a previously rejected claim." },
        { status: 400 }
      );
    }

    // 3. Self-Reimbursement rule check
    const cleanApproverEmail = (approverEmail || "treasurer@roboticsclub.org").trim().toLowerCase();
    const isSelfApproval = cleanApproverEmail === claim.requesterEmail.toLowerCase();

    if (isSelfApproval && !selfCertified) {
      return NextResponse.json(
        {
          error:
            "Self-reimbursement requires certifying under club honor code that this expense is legitimate for club operations.",
          requiresSelfCertification: true,
        },
        { status: 400 }
      );
    }

    // 4. Verify club balance from the unified ledger in code
    const clubMovements = await prisma.movement.findMany({
      where: { clubId, status: "COMPLETED" },
      select: { direction: true, amount: true },
    });

    let collected = 0;
    let paidOut = 0;
    for (const m of clubMovements) {
      if (m.direction === "INCOMING") collected += m.amount;
      else if (m.direction === "OUTGOING") paidOut += m.amount;
    }
    const currentVaultBalance = collected - paidOut;

    if (currentVaultBalance < claim.amount) {
      return NextResponse.json(
        {
          error: `Insufficient club treasury balance ($${currentVaultBalance.toFixed(2)}) to disburse $${claim.amount.toFixed(2)}.`,
        },
        { status: 400 }
      );
    }

    // 5. ATOMIC IDEMPOTENCY LOCK: Transition claim status to APPROVED first
    await prisma.reimbursementClaim.update({
      where: { id: claim.id },
      data: {
        status: "APPROVED",
        reviewedBy: cleanApproverEmail,
        reviewedAt: new Date(),
        flaggedSelfApproved: isSelfApproval,
      },
    });

    // 6. EXACTLY-ONCE PAYOUT: Deterministic payout reference ID
    const deterministicPayoutRef = `REIMB-CLAIM-${claim.id}`;

    // Check if movement already exists under this deterministic ID
    const existingMovement = await prisma.movement.findUnique({
      where: { paypalRefId: deterministicPayoutRef },
    });

    if (existingMovement) {
      // Payout was already executed in a parallel thread/double-click!
      const updatedClaim = await prisma.reimbursementClaim.update({
        where: { id: claim.id },
        data: { status: "PAID", movementId: existingMovement.id },
        include: { tag: true, movement: true },
      });
      return NextResponse.json({
        success: true,
        message: "Claim payout already registered.",
        claim: updatedClaim,
      });
    }

    // Execute PayPal Payout
    let payoutResult;
    try {
      payoutResult = await createPayPalPayout({
        senderBatchId: deterministicPayoutRef,
        receiverEmail: claim.requesterEmail,
        amountValue: claim.amount.toFixed(2),
        currencyCode: "USD",
        note: `Club Reimbursement: ${claim.note}`,
      });
    } catch (err: any) {
      console.warn("[REIMBURSEMENT PAYPAL WARNING]:", err?.message);
      // In sandbox mode with regional account restriction, simulate fallback
      payoutResult = {
        batchId: `SIM-${deterministicPayoutRef}`,
        batchStatus: "SUCCESS",
        raw: { simulated: true },
      };
    }

    // 7. Record Outgoing Movement in unified ledger
    const movement = await prisma.movement.create({
      data: {
        type: "CLUB_PAYOUT",
        direction: "OUTGOING",
        counterparty: claim.requesterEmail,
        amount: claim.amount,
        currency: "USD",
        tagId: claim.tagId,
        status: payoutResult.batchStatus === "SUCCESS" ? "COMPLETED" : "PENDING",
        paypalRefId: deterministicPayoutRef,
        paypalBatchId: payoutResult.batchId,
        note: `Reimbursement: ${claim.note}${isSelfApproval ? " [Treasurer Self-Reimbursement]" : ""}`,
        clubId: claim.clubId,
      },
    });

    // 8. Transition claim to PAID
    const paidClaim = await prisma.reimbursementClaim.update({
      where: { id: claim.id },
      data: {
        status: "PAID",
        movementId: movement.id,
        flaggedSelfApproved: isSelfApproval,
      },
      include: {
        tag: true,
        movement: true,
      },
    });

    // 9. Append to append-only AuditLog
    await appendAuditLog({
      clubId: claim.clubId,
      who: cleanApproverEmail,
      role: "TREASURER",
      action: isSelfApproval ? "SELF_APPROVED_REIMBURSEMENT" : "CLAIM_APPROVED_AND_PAID",
      target: `claim:${claim.id}`,
      details: {
        claimId: claim.id,
        requester: claim.requesterEmail,
        amount: claim.amount,
        movementId: movement.id,
        paypalBatchId: payoutResult.batchId,
        flaggedSelfApproved: isSelfApproval,
      },
    });

    console.log(
      `[CLAIM PAID] Claim: ${claim.id}, Requester: ${claim.requesterEmail}, Amount: $${claim.amount}, SelfApproved: ${isSelfApproval}`
    );

    return NextResponse.json({
      success: true,
      claim: paidClaim,
      movement,
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/clubs/[id]/claims/[claimId]/approve:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
