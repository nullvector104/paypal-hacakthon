import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/tags - List all expense tags
export async function GET() {
  try {
    let tags = await prisma.tag.findMany({
      orderBy: { name: "asc" },
    });

    if (tags.length === 0) {
      const defaultTags = [
        { name: "Food", monthlyLimit: 250.0 },
        { name: "Games", monthlyLimit: 100.0 },
        { name: "Electronics", monthlyLimit: 400.0 },
        { name: "Clothing", monthlyLimit: 150.0 },
        { name: "Other", monthlyLimit: 100.0 },
      ];

      for (const t of defaultTags) {
        await prisma.tag.upsert({
          where: { name: t.name },
          update: {},
          create: t,
        });
      }

      tags = await prisma.tag.findMany({
        orderBy: { name: "asc" },
      });
    }

    return NextResponse.json({ tags });
  } catch (error: unknown) {
    console.error("Error fetching tags:", error);
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ error: message, tags: [] }, { status: 500 });
  }
}

// POST /api/tags - Create a new tag with monthlyLimit
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, monthlyLimit } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Tag name is required." },
        { status: 400 }
      );
    }

    const limitVal = parseFloat(monthlyLimit);
    if (isNaN(limitVal) || limitVal < 0) {
      return NextResponse.json(
        { error: "Monthly limit must be a positive number." },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    // Check if tag already exists
    const existing = await prisma.tag.findUnique({
      where: { name: trimmedName },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Tag "${trimmedName}" already exists.` },
        { status: 409 }
      );
    }

    const newTag = await prisma.tag.create({
      data: {
        name: trimmedName,
        monthlyLimit: limitVal,
      },
    });

    return NextResponse.json({ success: true, tag: newTag });
  } catch (error: unknown) {
    console.error("Error creating tag:", error);
    const message = error instanceof Error ? error.message : "Failed to create tag";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
