import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/tags/[id] - Edit tag name and/or monthlyLimit
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { name, monthlyLimit } = body;

    const updateData: { name?: string; monthlyLimit?: number } = {};

    if (name && typeof name === "string" && name.trim()) {
      updateData.name = name.trim();
    }

    if (monthlyLimit !== undefined) {
      const limitVal = parseFloat(monthlyLimit);
      if (isNaN(limitVal) || limitVal < 0) {
        return NextResponse.json(
          { error: "Monthly limit must be a positive number." },
          { status: 400 }
        );
      }
      updateData.monthlyLimit = limitVal;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update." },
        { status: 400 }
      );
    }

    const updated = await prisma.tag.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, tag: updated });
  } catch (error: unknown) {
    console.error("Error in PATCH /api/tags/[id]:", error);
    const message = error instanceof Error ? error.message : "Failed to update tag";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/tags/[id] - Delete a tag (if no purchases attached)
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // Check if tag is used by any movements
    const movementsCount = await prisma.movement.count({
      where: { tagId: id },
    });

    if (movementsCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete tag because ${movementsCount} movement(s) are associated with it.`,
        },
        { status: 400 }
      );
    }

    await prisma.tag.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: unknown) {
    console.error("Error in DELETE /api/tags/[id]:", error);
    const message = error instanceof Error ? error.message : "Failed to delete tag";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
