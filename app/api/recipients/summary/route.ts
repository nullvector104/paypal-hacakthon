import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentMonthRange } from "@/lib/spending";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email")?.trim();

    if (!email) {
      return NextResponse.json(
        { allTimeTotal: 0, thisMonthTotal: 0, count: 0, lastTransactionDate: null },
        { status: 200 }
      );
    }

    const { start, end } = getCurrentMonthRange();

    // Query all completed outgoing movements to this recipient
    const movements = await prisma.movement.findMany({
      where: {
        counterparty: {
          equals: email,
          mode: "insensitive",
        },
        direction: "OUTGOING",
        status: "COMPLETED",
      },
      select: {
        amount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const allTimeTotal = movements.reduce((sum, m) => sum + m.amount, 0);
    const thisMonthMovements = movements.filter(
      (m) => m.createdAt >= start && m.createdAt <= end
    );
    const thisMonthTotal = thisMonthMovements.reduce((sum, m) => sum + m.amount, 0);

    return NextResponse.json({
      email,
      allTimeTotal: parseFloat(allTimeTotal.toFixed(2)),
      thisMonthTotal: parseFloat(thisMonthTotal.toFixed(2)),
      count: movements.length,
      lastTransactionDate: movements[0]?.createdAt || null,
    });
  } catch (error: unknown) {
    console.error("Error in GET /api/recipients/summary:", error);
    return NextResponse.json(
      { allTimeTotal: 0, thisMonthTotal: 0, count: 0, error: "Database error" },
      { status: 500 }
    );
  }
}
