import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendAuditLog } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; claimId: string }> }
) {
  try {
    const { id: clubId, claimId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const {
      reason,
      userRole, // Must be "TREASURER"
      userEmail,
    } = body;

    // Strict server role check
    if (userRole !== "TREASURER") {
      return NextResponse.json(
        { error: "Unauthorized: Only the Treasurer can reject reimbursement claims." },
        { status: 403 }
      );
    }

    const claim = await prisma.reimbursementClaim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      return NextResponse.json({ error: "Claim not found." }, { status: 404 });
    }

    if (claim.status === "PAID") {
      return NextResponse.json({ error: "Cannot reject a claim that has already been paid." }, { status: 400 });
    }

    const rejectionReason = reason?.trim() || "Declined by Treasurer";

    const rejectedClaim = await prisma.reimbursementClaim.update({
      where: { id: claim.id },
      data: {
        status: "REJECTED",
        rejectionReason,
        reviewedBy: userEmail || "treasurer",
        reviewedAt: new Date(),
      },
    });

    // Append to append-only AuditLog
    await appendAuditLog({
      clubId,
      who: userEmail || "treasurer",
      role: "TREASURER",
      action: "CLAIM_REJECTED",
      target: `claim:${claim.id}`,
      details: {
        claimId: claim.id,
        reason: rejectionReason,
        amount: claim.amount,
        requester: claim.requesterEmail,
      },
    });

    return NextResponse.json({
      success: true,
      claim: rejectedClaim,
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/clubs/[id]/claims/[claimId]/reject:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
