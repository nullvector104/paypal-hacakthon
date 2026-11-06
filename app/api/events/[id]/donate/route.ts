import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPayPalOrder } from "@/lib/paypal";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const { amount, donorEmail, donorName } = body;

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: "Donation amount must be greater than zero." }, { status: 400 });
    }

    const event = await prisma.eventFundraiser.findUnique({
      where: { id: eventId },
      include: { tag: true, club: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Event fundraiser not found." }, { status: 404 });
    }

    const cleanDonorEmail = (donorEmail || "donor@example.com").trim().toLowerCase();
    const amountValue = numericAmount.toFixed(2);

    // Create PayPal Order v2
    const order = await createPayPalOrder({
      amountValue,
      currencyCode: "USD",
      customId: `EVENT-${event.id}`,
      items: [
        {
          name: `Contribution: ${event.title}`,
          quantity: "1",
          unit_amount: {
            currency_code: "USD",
            value: amountValue,
          },
          description: `Fundraiser support for ${event.title}`,
        },
      ],
    });

    const approveLink = order.links?.find((l) => l.rel === "approve")?.href || null;

    // Record PENDING movement in unified ledger tagged to the event
    const movement = await prisma.movement.create({
      data: {
        type: "CART_PAYMENT", // Payments via Orders tagged to the event
        direction: "INCOMING",
        counterparty: cleanDonorEmail,
        amount: numericAmount,
        currency: "USD",
        tagId: event.tagId,
        status: "PENDING",
        paypalRefId: order.id,
        note: `Fundraiser Contribution: ${event.title} (${donorName || cleanDonorEmail})`,
        clubId: event.clubId,
        eventId: event.id,
      },
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      approveUrl: approveLink,
      movementId: movement.id,
      amount: numericAmount,
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/events/[id]/donate:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
