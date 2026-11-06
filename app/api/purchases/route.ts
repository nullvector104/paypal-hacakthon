import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const movements = await prisma.movement.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      include: {
        tag: true,
        club: true,
      },
    });

    return NextResponse.json({ purchases: movements, movements });
  } catch (error: unknown) {
    console.error("Error fetching movements:", error);
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ error: message, purchases: [], movements: [] }, { status: 500 });
  }
}
