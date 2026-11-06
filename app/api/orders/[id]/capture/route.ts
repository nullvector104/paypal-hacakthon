
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { capturePayPalOrder } from "@/lib/paypal";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing order ID in request params." },
        { status: 400 }
      );
    }

    console.log(`[ORDER CAPTURE INITIATED] PayPal Order: ${id}`);

    // 1. Authoritatively capture the payment on PayPal server
    const captureData = await capturePayPalOrder(id);

    console.log(`[PAYPAL CAPTURE RESPONSE] Status: ${captureData.status}`);

    // 2. Authoritative database update based solely on PayPal's response
    if (captureData.status === "COMPLETED") {
      const updatedMovement = await prisma.movement.update({
        where: { paypalRefId: id },
        data: { status: "COMPLETED" },
        include: { tag: true },
      });

      // Clear the database cart upon completed purchase
      await prisma.cartItem.deleteMany();

      console.log(
        `[MOVEMENT COMPLETED] DB ID: ${updatedMovement.id}, Tag: ${updatedMovement.tag.name}, Amount: $${updatedMovement.amount}`
      );

      return NextResponse.json({
        success: true,
        status: "COMPLETED",
        orderId: id,
        movement: {
          id: updatedMovement.id,
          amount: updatedMovement.amount,
          tag: updatedMovement.tag.name,
          status: updatedMovement.status,
        },
      });
    } else {
      // Payment was not completed
      await prisma.movement.update({
        where: { paypalRefId: id },
        data: { status: "FAILED" },
      });

      return NextResponse.json(
        {
          success: false,
          status: captureData.status,
          error: "Payment was not completed by PayPal.",
        },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    console.error("Error in POST /api/orders/[id]/capture:", error);
    const message = error instanceof Error ? error.message : "Capture failed";

    // Attempt to mark Movement as FAILED if error occurred
    try {
      const { id } = await context.params;
      if (id) {
        await prisma.movement.update({
          where: { paypalRefId: id },
          data: { status: "FAILED" },
        });
      }
    } catch {
      // Ignore fallback db update errors
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
