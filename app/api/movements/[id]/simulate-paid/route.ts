import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordPayPalInvoicePayment } from "@/lib/paypal";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const movement = await prisma.movement.findUnique({
      where: { id },
    });

    if (!movement) {
      return NextResponse.json({ error: "Movement not found." }, { status: 404 });
    }

    if (movement.type !== "REQUEST") {
      return NextResponse.json(
        { error: "Only payment requests/invoices can be marked paid." },
        { status: 400 }
      );
    }

    if (movement.status === "COMPLETED") {
      return NextResponse.json({ error: "Invoice is already paid." }, { status: 400 });
    }

    // 1. Record payment in PayPal sandbox
    try {
      await recordPayPalInvoicePayment(
        movement.paypalRefId,
        movement.amount.toFixed(2),
        movement.currency
      );
    } catch (err) {
      console.warn("Could not record payment on PayPal invoice directly:", err);
      // We still proceed to update our local sandbox ledger
    }

    // 2. Authoritatively mark COMPLETED in our unified ledger
    const updated = await prisma.movement.update({
      where: { id },
      data: { status: "COMPLETED" },
      include: { tag: true, club: true },
    });

    // 3. If club dues, increment club treasury balance
    if (movement.clubId) {
      await prisma.club.update({
        where: { id: movement.clubId },
        data: { balance: { increment: movement.amount } },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Invoice marked as paid successfully.",
      movement: updated,
    });
  } catch (error: unknown) {
    console.error("Error simulating invoice payment:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
