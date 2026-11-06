import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Hardcoded test cart for Phase 1 validation
const TEST_CART = [
  {
    productId: "test-prod-1",
    title: "Eco Organic Coffee Beans 500g",
    unitPrice: 18.5,
    quantity: 1,
  },
  {
    productId: "test-prod-2",
    title: "Whole Wheat Artisanal Sourdough",
    unitPrice: 6.5,
    quantity: 2,
  },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { tagId } = body;

    const itemsTotal = TEST_CART.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );
    const amountValue = itemsTotal.toFixed(2);
    const currency = "USD";

    // 1. Get or create tag
    let selectedTagId = tagId;
    if (!selectedTagId) {
      let defaultTag = await prisma.tag.findFirst();
      if (!defaultTag) {
        defaultTag = await prisma.tag.create({
          data: { name: "Food", monthlyLimit: 250.0 },
        });
      }
      selectedTagId = defaultTag.id;
    }

    // 2. Generate simulated order ID
    const simulatedOrderId = `DEV-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // 3. Create PENDING movement row first to verify lifecycle with detail line items
    const movement = await prisma.movement.create({
      data: {
        type: "CART_PAYMENT",
        direction: "OUTGOING",
        counterparty: "Online Merchant (Dev Simulation)",
        paypalRefId: simulatedOrderId,
        amount: parseFloat(amountValue),
        currency,
        tagId: selectedTagId,
        status: "PENDING",
        note: "Instant dev test checkout",
        items: {
          create: TEST_CART.map((item) => ({
            productId: item.productId,
            title: item.title,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
          })),
        },
      },
      include: { items: true },
    });

    // 4. Authoritatively mark as COMPLETED
    const completedMovement = await prisma.movement.update({
      where: { id: movement.id },
      data: { status: "COMPLETED" },
      include: { tag: true },
    });

    return NextResponse.json({
      success: true,
      orderId: simulatedOrderId,
      movement: {
        id: completedMovement.id,
        amount: completedMovement.amount,
        tag: completedMovement.tag.name,
        status: completedMovement.status,
      },
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/orders/dev-test:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
