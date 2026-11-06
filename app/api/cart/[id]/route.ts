import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/cart/[id] - Change quantity
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { quantity } = body;

    if (typeof quantity !== "number") {
      return NextResponse.json(
        { error: "Quantity must be a number" },
        { status: 400 }
      );
    }

    if (quantity <= 0) {
      // Remove item if quantity is zero or negative
      await prisma.cartItem.delete({
        where: { id },
      });
      return NextResponse.json({ success: true, removed: true });
    }

    const updated = await prisma.cartItem.update({
      where: { id },
      data: { quantity },
    });

    return NextResponse.json({ success: true, item: updated });
  } catch (error: unknown) {
    console.error("Error in PATCH /api/cart/[id]:", error);
    const message = error instanceof Error ? error.message : "Failed to update quantity";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/cart/[id] - Remove specific cart item
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    await prisma.cartItem.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, removedId: id });
  } catch (error: unknown) {
    console.error("Error in DELETE /api/cart/[id]:", error);
    const message = error instanceof Error ? error.message : "Failed to remove item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
