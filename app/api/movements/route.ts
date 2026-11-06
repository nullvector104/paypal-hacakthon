import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const movements = await prisma.movement.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: {
        tag: true,
        club: true,
        items: true,
      },
    });

    return NextResponse.json({ movements });
  } catch (error: unknown) {
    console.error("Error in GET /api/movements:", error);
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ error: message, movements: [] }, { status: 500 });
  }
}
