import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clubId } = await context.params;

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: {
        tags: true,
      },
    });

    if (!club) {
      return NextResponse.json({ error: "Club not found." }, { status: 404 });
    }

    // Load all movements for this club
    const movements = await prisma.movement.findMany({
      where: { clubId },
      orderBy: { createdAt: "desc" },
      include: {
        tag: true,
        items: true,
        claim: true,
      },
    });

    // Load append-only audit trail
    const auditLogs = await prisma.auditLog.findMany({
      where: { clubId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Compute balance strictly in CODE from the unified ledger
    let collected = 0;
    let paidOut = 0;

    for (const m of movements) {
      if (m.status === "COMPLETED") {
        if (m.direction === "INCOMING") collected += m.amount;
        else if (m.direction === "OUTGOING") paidOut += m.amount;
      }
    }

    const balance = parseFloat((collected - paidOut).toFixed(2));

    return NextResponse.json({
      clubId,
      clubName: club.name,
      balance,
      collected: parseFloat(collected.toFixed(2)),
      paidOut: parseFloat(paidOut.toFixed(2)),
      tags: club.tags,
      movements,
      auditLogs,
    });
  } catch (error: unknown) {
    console.error("Error in GET /api/clubs/[id]/ledger:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
