import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getPayPalOrderDetails,
  getPayPalPayoutBatchDetails,
  getPayPalInvoiceDetails,
} from "@/lib/paypal";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const movement = await prisma.movement.findUnique({
      where: { id },
      include: { club: true, tag: true },
    });

    if (!movement) {
      return NextResponse.json({ error: "Movement not found." }, { status: 404 });
    }

    let newStatus = movement.status;

    if (movement.type === "CART_PAYMENT") {
      const order = await getPayPalOrderDetails(movement.paypalRefId);
      if (order.status === "COMPLETED") {
        newStatus = "COMPLETED";
      } else if (order.status === "VOIDED") {
        newStatus = "EXPIRED";
      }
    } else if (movement.type === "SEND") {
      const payout = await getPayPalPayoutBatchDetails(movement.paypalRefId);
      const batchStatus = payout.batch_header?.batch_status;
      if (batchStatus === "SUCCESS") {
        newStatus = "COMPLETED";
      } else if (batchStatus === "DENIED" || batchStatus === "CANCELED") {
        newStatus = "FAILED";
      }
    } else if (movement.type === "REQUEST") {
      const invoice = await getPayPalInvoiceDetails(movement.paypalRefId);
      if (invoice.status === "PAID" || invoice.status === "MARKED_AS_PAID") {
        newStatus = "COMPLETED";
      } else if (invoice.status === "CANCELLED") {
        newStatus = "CANCELLED";
      }
    }

    if (newStatus !== movement.status) {
      const updated = await prisma.movement.update({
        where: { id },
        data: { status: newStatus },
        include: { tag: true, club: true },
      });

      // If club dues request newly completed, increment club treasury balance
      if (movement.clubId && movement.type === "REQUEST" && newStatus === "COMPLETED") {
        await prisma.club.update({
          where: { id: movement.clubId },
          data: { balance: { increment: movement.amount } },
        });
      }

      return NextResponse.json({ success: true, movement: updated, changed: true });
    }

    return NextResponse.json({ success: true, movement, changed: false });
  } catch (error: unknown) {
    console.error("Error refreshing movement status:", error);
    const message = error instanceof Error ? error.message : "Sync error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
