import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPayPalOrder } from "@/lib/paypal";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { tagId } = body;

    // 1. Load active cart items directly from the database
    const cartItems = await prisma.cartItem.findMany({
      orderBy: { createdAt: "asc" },
    });

    if (cartItems.length === 0) {
      return NextResponse.json(
        { error: "Cart is empty. Please add products to your cart before checkout." },
        { status: 400 }
      );
    }

    // 2. Compute total strictly on the server (Never accept amount from browser)
    const itemsTotal = cartItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );
    const amountValue = itemsTotal.toFixed(2);
    const currency = "USD";

    // 3. Ensure a valid expense tag is assigned
    let selectedTagId = tagId;
    if (!selectedTagId) {
      let defaultTag = await prisma.tag.findFirst({
        where: { name: "Food" },
      });
      if (!defaultTag) {
        defaultTag = await prisma.tag.create({
          data: {
            name: "Food",
            monthlyLimit: 250.0,
          },
        });
      }
      selectedTagId = defaultTag.id;
    } else {
      const tagExists = await prisma.tag.findUnique({
        where: { id: selectedTagId },
      });
      if (!tagExists) {
        return NextResponse.json(
          { error: `Tag with id ${selectedTagId} not found.` },
          { status: 400 }
        );
      }
    }

    // 4. STEP A: RECORD PENDING ROW FIRST IN UNIFIED LEDGER
    const draftOrderId = `ORDER-DRAFT-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const movement = await prisma.movement.create({
      data: {
        type: "CART_PAYMENT",
        direction: "OUTGOING",
        counterparty: "Online Merchant (Channel3)",
        amount: parseFloat(amountValue),
        currency,
        tagId: selectedTagId,
        status: "PENDING",
        paypalRefId: draftOrderId,
        note: `Cart checkout (${cartItems.length} items)`,
        items: {
          create: cartItems.map((item) => ({
            productId: item.productId,
            title: item.title,
            imageUrl: item.imageUrl,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            offerUrl: item.offerUrl,
          })),
        },
      },
      include: { tag: true, items: true },
    });

    console.log(
      `[ORDER STEP 1: PENDING RECORDED] Movement ID: ${movement.id}, Amount: $${amountValue}, Tag: ${selectedTagId}, Items: ${cartItems.length}`
    );

    // 5. STEP B: CALL PAYPAL ORDERS V2 REST API
    try {
      const paypalOrder = await createPayPalOrder({
        amountValue,
        currencyCode: currency,
        customId: movement.id,
        items: cartItems.map((item) => ({
          name: item.title.slice(0, 127),
          quantity: item.quantity.toString(),
          unit_amount: {
            currency_code: currency,
            value: item.unitPrice.toFixed(2),
          },
        })),
      });

      // 6. STEP C: UPDATE STATUS & PAYPAL REF ID FROM PAYPAL'S REAL RESPONSE
      await prisma.movement.update({
        where: { id: movement.id },
        data: {
          paypalRefId: paypalOrder.id,
        },
      });

      console.log(
        `[ORDER STEP 2: PAYPAL RESPONDED] PayPal Order: ${paypalOrder.id}, Movement: ${movement.id}`
      );

      return NextResponse.json({
        orderId: paypalOrder.id,
        movementId: movement.id,
        amount: amountValue,
        currency,
      });
    } catch (paypalErr: unknown) {
      console.error("PayPal Create Order Failed:", paypalErr);
      const msg = paypalErr instanceof Error ? paypalErr.message : "Failed to create PayPal order";

      await prisma.movement.update({
        where: { id: movement.id },
        data: {
          status: "FAILED",
          note: `${movement.note || ""} [PayPal Order Error: ${msg.slice(0, 150)}]`.trim(),
        },
      });

      return NextResponse.json(
        { error: msg, movementId: movement.id, status: "FAILED" },
        { status: 502 }
      );
    }
  } catch (error: unknown) {
    console.error("Error in POST /api/orders:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
