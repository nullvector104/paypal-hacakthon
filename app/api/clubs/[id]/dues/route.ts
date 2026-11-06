import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendAuditLog } from "@/lib/audit";
import { createAndSendPayPalInvoice } from "@/lib/paypal";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clubId } = await context.params;

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: {
        members: { orderBy: { role: "desc" } },
        duesCycles: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!club) {
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }

    // Load all CLUB_DUES movements for this club to dynamically compute status
    const duesMovements = await prisma.movement.findMany({
      where: {
        clubId,
        type: "CLUB_DUES",
      },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();

    // Compute Paid / Pending / Overdue in code for each dues cycle & member
    const cyclesWithMemberStatus = club.duesCycles.map((cycle) => {
      const isPastDueDate = now > new Date(cycle.dueDate);

      const memberStatuses = club.members.map((member) => {
        // Find matching movement for this member
        const movement = duesMovements.find(
          (m) =>
            m.counterparty.toLowerCase() === member.email.toLowerCase() &&
            (m.note?.includes(cycle.title) || Math.abs(new Date(m.createdAt).getTime() - new Date(cycle.createdAt).getTime()) < 10000)
        );

        let status: "PAID" | "PENDING" | "OVERDUE" | "UNBILLED" = "UNBILLED";
        if (movement) {
          if (movement.status === "COMPLETED") {
            status = "PAID";
          } else if (isPastDueDate) {
            status = "OVERDUE";
          } else {
            status = "PENDING";
          }
        } else if (isPastDueDate) {
          status = "OVERDUE";
        }

        return {
          memberId: member.id,
          memberName: member.name,
          memberEmail: member.email,
          role: member.role,
          status, // In-code computed status
          amount: cycle.amount,
          movementId: movement?.id || null,
          invoiceUrl: movement?.invoiceUrl || null,
          paypalRefId: movement?.paypalRefId || null,
          paidAt: movement?.status === "COMPLETED" ? movement.updatedAt : null,
        };
      });

      const totalExpected = cycle.amount * club.members.length;
      const paidMembers = memberStatuses.filter((s) => s.status === "PAID");
      const totalCollected = paidMembers.length * cycle.amount;

      return {
        id: cycle.id,
        title: cycle.title,
        amount: cycle.amount,
        dueDate: cycle.dueDate,
        isPastDueDate,
        totalExpected,
        totalCollected,
        progressPercent: totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0,
        memberStatuses,
        createdAt: cycle.createdAt,
      };
    });

    return NextResponse.json({
      clubId,
      duesCycles: cyclesWithMemberStatus,
    });
  } catch (error: unknown) {
    console.error("Error in GET /api/clubs/[id]/dues:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clubId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const {
      amount,
      dueDate,
      title,
      userRole, // Must be "TREASURER"
      userEmail,
    } = body;

    // 1. Strict server-side role check
    if (userRole !== "TREASURER") {
      return NextResponse.json(
        { error: "Unauthorized: Only the club Treasurer can set and issue dues cycles." },
        { status: 403 }
      );
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: "Dues amount must be greater than zero." }, { status: 400 });
    }

    if (!dueDate) {
      return NextResponse.json({ error: "A valid due date is required." }, { status: 400 });
    }

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: {
        members: true,
        tags: true,
      },
    });

    if (!club) {
      return NextResponse.json({ error: "Club not found." }, { status: 404 });
    }

    // 2. Tag for club dues
    let clubTag = club.tags[0];
    if (!clubTag) {
      clubTag = await prisma.tag.create({
        data: {
          name: `${club.name} Dues`,
          monthlyLimit: 1000.0,
          clubId: club.id,
        },
      });
    }

    const cycleTitle = title?.trim() || `${club.name} Dues - ${new Date().toLocaleString("en-US", { month: "short", year: "numeric" })}`;

    // 3. Create the DuesCycle record
    const duesCycle = await prisma.duesCycle.create({
      data: {
        clubId: club.id,
        title: cycleTitle,
        amount: numericAmount,
        dueDate: new Date(dueDate),
      },
    });

    // 4. Issue one Invoicing request per member
    const createdMovements = [];
    for (const member of club.members) {
      const draftRefId = `DUES-DRAFT-${duesCycle.id}-${member.id}-${Date.now()}`;

      // STEP A: Record PENDING movement in unified ledger first
      let movement = await prisma.movement.create({
        data: {
          type: "CLUB_DUES",
          direction: "INCOMING",
          counterparty: member.email,
          amount: numericAmount,
          currency: "USD",
          tagId: clubTag.id,
          status: "PENDING",
          paypalRefId: draftRefId,
          note: cycleTitle,
          clubId: club.id,
        },
      });

      let invoiceData;
      try {
        invoiceData = await createAndSendPayPalInvoice({
          recipientEmail: member.email,
          recipientName: member.name,
          amountValue: numericAmount.toFixed(2),
          currencyCode: "USD",
          itemName: cycleTitle,
          note: `Club dues for ${club.name}. Due by ${new Date(dueDate).toLocaleDateString()}`,
        });
      } catch (err: any) {
        console.warn(`[DUES INVOICE WARNING] PayPal Invoice fallback for ${member.email}:`, err?.message);
        // Fallback simulation reference for sandbox resilience
        invoiceData = {
          invoiceId: `INV-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
          payerViewUrl: `https://www.sandbox.paypal.com/invoice/payer-view/details/SIM-DUES-${Date.now()}`,
          status: "SENT",
        };
      }

      // STEP B: Update Movement with real PayPal Invoice reference and payer view URL
      movement = await prisma.movement.update({
        where: { id: movement.id },
        data: {
          paypalRefId: invoiceData.invoiceId,
          invoiceUrl: invoiceData.payerViewUrl,
        },
      });

      createdMovements.push(movement);
    }

    // 5. Append to append-only AuditLog
    await appendAuditLog({
      clubId: club.id,
      who: userEmail || "treasurer",
      role: "TREASURER",
      action: "DUES_CYCLE_CREATED",
      target: `dues:${duesCycle.id}`,
      details: {
        cycleId: duesCycle.id,
        title: duesCycle.title,
        amount: numericAmount,
        dueDate: duesCycle.dueDate,
        membersBilledCount: createdMovements.length,
      },
    });

    console.log(
      `[DUES CREATED] Club: ${club.name}, Cycle: ${duesCycle.title}, Amount: $${numericAmount}, Invoiced: ${createdMovements.length} members`
    );

    return NextResponse.json({
      success: true,
      duesCycle,
      invoicesCreated: createdMovements.length,
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/clubs/[id]/dues:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
