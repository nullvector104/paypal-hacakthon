import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const clubs = await prisma.club.findMany({
      include: {
        members: {
          orderBy: { role: "desc" }, // TREASURER first
        },
        tags: true,
        duesCycles: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        claims: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { tag: true },
        },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        movements: {
          where: { status: "COMPLETED" },
          select: {
            direction: true,
            amount: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Compute club balance strictly in CODE from the unified ledger:
    // balance = collected (INCOMING COMPLETED) - paid out (OUTGOING COMPLETED)
    const formattedClubs = clubs.map((c) => {
      let collected = 0;
      let paidOut = 0;

      for (const m of c.movements) {
        if (m.direction === "INCOMING") {
          collected += m.amount;
        } else if (m.direction === "OUTGOING") {
          paidOut += m.amount;
        }
      }

      const computedBalance = parseFloat((collected - paidOut).toFixed(2));

      return {
        id: c.id,
        name: c.name,
        description: c.description,
        balance: computedBalance, // Strictly computed from ledger
        collected: parseFloat(collected.toFixed(2)),
        paidOut: parseFloat(paidOut.toFixed(2)),
        members: c.members,
        tags: c.tags,
        duesCycles: c.duesCycles,
        claims: c.claims,
        auditLogs: c.auditLogs,
        createdAt: c.createdAt,
      };
    });

    return NextResponse.json({ clubs: formattedClubs });
  } catch (error: unknown) {
    console.error("Error in GET /api/clubs:", error);
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ error: message, clubs: [] }, { status: 500 });
  }
}
