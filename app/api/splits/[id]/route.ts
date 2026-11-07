import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendAuditLog } from "@/lib/audit";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: splitId } = await context.params;

    const split = await prisma.billSplit.findUnique({
      where: { id: splitId },
      include: { movements: true },
    });

    if (!split) {
      return NextResponse.json({ error: "Split record not found." }, { status: 404 });
    }

    // 1. Delete any pending movements linked to this split
    await prisma.movement.deleteMany({
      where: {
        splitId,
        status: "PENDING",
      },
    });

    // 2. Unlink any completed movements so the financial history remains intact
    await prisma.movement.updateMany({
      where: { splitId },
      data: { splitId: null },
    });

    // 3. Delete the BillSplit record
    await prisma.billSplit.delete({
      where: { id: splitId },
    });

    // 4. Log immutable audit entry
    await appendAuditLog({
      clubId: split.clubId,
      who: split.creatorEmail,
      role: "MEMBER",
      action: "BILL_SPLIT_DELETED",
      target: `split:${splitId}`,
      details: {
        title: split.title,
        totalAmount: split.totalAmount,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Split bill "${split.title}" deleted successfully.`,
    });
  } catch (error: unknown) {
    console.error("Error deleting split bill:", error);
    const message = error instanceof Error ? error.message : "Failed to delete split bill";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

