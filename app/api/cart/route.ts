import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/cart - Return all cart items and server-computed total
export async function GET() {
  try {
    const items = await prisma.cartItem.findMany({
      orderBy: { createdAt: "desc" },
    });

    const total = items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );

    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

    return NextResponse.json({
      items,
      itemCount,
      total: parseFloat(total.toFixed(2)),
      currency: "USD",
    });
  } catch (error: unknown) {
    console.error("Error in GET /api/cart:", error);
    const message = error instanceof Error ? error.message : "Failed to load cart";
    return NextResponse.json({ error: message, items: [], total: 0 }, { status: 500 });
  }
}

// POST /api/cart - Add item to cart or increment quantity
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productId, title, imageUrl, unitPrice, offerUrl, quantity = 1 } = body;

    if (!productId || !title || typeof unitPrice !== "number") {
      return NextResponse.json(
        { error: "Missing required fields: productId, title, unitPrice" },
        { status: 400 }
      );
    }

    // Check if product is already in the database cart
    const existing = await prisma.cartItem.findFirst({
      where: { productId },
    });

    let item;
    if (existing) {
      item = await prisma.cartItem.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + quantity,
          unitPrice, // Keep updated price
        },
      });
    } else {
      item = await prisma.cartItem.create({
        data: {
          productId,
          title,
          imageUrl: imageUrl || null,
          unitPrice,
          quantity: Math.max(1, quantity),
          offerUrl: offerUrl || null,
        },
      });
    }

    // Calculate updated total
    const allItems = await prisma.cartItem.findMany();
    const total = allItems.reduce(
      (sum, i) => sum + i.unitPrice * i.quantity,
      0
    );

    return NextResponse.json({
      success: true,
      item,
      cartTotal: parseFloat(total.toFixed(2)),
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/cart:", error);
    const message = error instanceof Error ? error.message : "Failed to add to cart";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/cart - Clear whole cart
export async function DELETE() {
  try {
    await prisma.cartItem.deleteMany();
    return NextResponse.json({ success: true, message: "Cart cleared" });
  } catch (error: unknown) {
    console.error("Error in DELETE /api/cart:", error);
    return NextResponse.json({ error: "Failed to clear cart" }, { status: 500 });
  }
}
