import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendAuditLog } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: splitId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const { movementId, memberEmail } = body;

    const split = await prisma.billSplit.findUnique({
      where: { id: splitId },
      include: { movements: true },
    });

    if (!split) {
      return NextResponse.json({ error: "Split bill not found." }, { status: 404 });
    }

    // Find target movement
    let targetMovement;
    if (movementId) {
      targetMovement = split.movements.find((m) => m.id === movementId);
    } else if (memberEmail) {
      targetMovement = split.movements.find(
        (m) => m.counterparty.toLowerCase() === memberEmail.trim().toLowerCase()
      );
    } else {
      // Settle the first pending movement
      targetMovement = split.movements.find((m) => m.status === "PENDING");
    }

    if (!targetMovement) {
      return NextResponse.json({ error: "Pending movement for this split not found." }, { status: 404 });
    }

    if (targetMovement.status === "COMPLETED") {
      return NextResponse.json({
        success: true,
        alreadySettled: true,
        movement: targetMovement,
      });
    }

    // Mark movement as COMPLETED
    const updatedMovement = await prisma.movement.update({
      where: { id: targetMovement.id },
      data: { status: "COMPLETED" },
    });

    // Append to append-only AuditLog
    await appendAuditLog({
      clubId: split.clubId,
      who: updatedMovement.counterparty,
      role: "MEMBER",
      action: "BILL_SPLIT_PAYMENT_SETTLED",
      target: `split:${split.id}`,
      details: {
        splitId: split.id,
        movementId: updatedMovement.id,
        amount: updatedMovement.amount,
        payer: updatedMovement.counterparty,
      },
    });

    // Dynamically recalculate in code
    const allMovements = await prisma.movement.findMany({
      where: { splitId: split.id },
    });

    const collected = allMovements
      .filter((m) => m.status === "COMPLETED")
      .reduce((sum, m) => sum + m.amount, 0);

    const totalRequested = allMovements.reduce((sum, m) => sum + m.amount, 0);
    const progressPercent =
      totalRequested > 0
        ? Math.min(100, parseFloat(((collected / totalRequested) * 100).toFixed(1)))
        : 0;

    return NextResponse.json({
      success: true,
      movement: updatedMovement,
      collected: parseFloat(collected.toFixed(2)),
      progressPercent,
      isFullySettled: allMovements.every((m) => m.status === "COMPLETED"),
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/splits/[id]/settle:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
