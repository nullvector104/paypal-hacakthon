import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendAuditLog } from "@/lib/audit";

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      description,
      treasurerName,
      treasurerEmail,
      tagName,
      monthlyLimit,
      startingBalance,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Club name is required" }, { status: 400 });
    }

    const tName =
      treasurerName && typeof treasurerName === "string" && treasurerName.trim()
        ? treasurerName.trim()
        : "Club Treasurer";
    const tEmail =
      treasurerEmail && typeof treasurerEmail === "string" && treasurerEmail.trim()
        ? treasurerEmail.trim().toLowerCase()
        : "treasurer@club.org";

    // 1. Create Club with default Treasurer member
    const newClub = await prisma.club.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        members: {
          create: {
            name: tName,
            email: tEmail,
            role: "TREASURER",
          },
        },
      },
    });

    // 2. Create or link Tag
    const rawTagName =
      tagName && typeof tagName === "string" && tagName.trim()
        ? tagName.trim()
        : `${name.trim()} Operations`;
    const tagBudget =
      monthlyLimit && !isNaN(Number(monthlyLimit)) && Number(monthlyLimit) > 0
        ? Number(monthlyLimit)
        : 500;

    let tag = await prisma.tag.findUnique({ where: { name: rawTagName } });
    if (tag) {
      if (!tag.clubId) {
        tag = await prisma.tag.update({
          where: { id: tag.id },
          data: { clubId: newClub.id },
        });
      } else {
        const uniqueTagName = `${name.trim()} - ${rawTagName}`;
        tag = await prisma.tag.upsert({
          where: { name: uniqueTagName },
          update: { clubId: newClub.id },
          create: {
            name: uniqueTagName,
            monthlyLimit: tagBudget,
            clubId: newClub.id,
          },
        });
      }
    } else {
      tag = await prisma.tag.create({
        data: {
          name: rawTagName,
          monthlyLimit: tagBudget,
          clubId: newClub.id,
        },
      });
    }

    // 3. Optional starting balance (incoming ledger movement)
    const initialDeposit =
      startingBalance && !isNaN(Number(startingBalance)) && Number(startingBalance) > 0
        ? Number(startingBalance)
        : 0;

    if (initialDeposit > 0) {
      await prisma.movement.create({
        data: {
          type: "CLUB_DUES",
          direction: "INCOMING",
          counterparty: tEmail,
          amount: parseFloat(initialDeposit.toFixed(2)),
          tagId: tag.id,
          status: "COMPLETED",
          paypalRefId: `SEED-${newClub.id.slice(-6).toUpperCase()}-${Date.now().toString().slice(-4)}`,
          note: `Initial treasury seed deposit for ${newClub.name}`,
          clubId: newClub.id,
        },
      });
    }

    // 4. Record Audit Log
    await appendAuditLog({
      clubId: newClub.id,
      who: tEmail,
      role: "TREASURER",
      action: "CLUB_CREATED",
      target: `club:${newClub.id}`,
      details: {
        name: newClub.name,
        treasurer: tName,
        email: tEmail,
        initialTag: tag.name,
        monthlyLimit: tagBudget,
        startingBalance: initialDeposit,
      },
    });

    // 5. Fetch and return complete club formatted
    const createdClub = await prisma.club.findUnique({
      where: { id: newClub.id },
      include: {
        members: { orderBy: { role: "desc" } },
        tags: true,
        duesCycles: true,
        claims: { include: { tag: true } },
        auditLogs: true,
        movements: {
          where: { status: "COMPLETED" },
          select: { direction: true, amount: true },
        },
      },
    });

    if (!createdClub) {
      return NextResponse.json({ error: "Failed to retrieve created club" }, { status: 500 });
    }

    let collected = 0;
    let paidOut = 0;
    for (const m of createdClub.movements) {
      if (m.direction === "INCOMING") collected += m.amount;
      else if (m.direction === "OUTGOING") paidOut += m.amount;
    }
    const computedBalance = parseFloat((collected - paidOut).toFixed(2));

    const formatted = {
      id: createdClub.id,
      name: createdClub.name,
      description: createdClub.description,
      balance: computedBalance,
      collected: parseFloat(collected.toFixed(2)),
      paidOut: parseFloat(paidOut.toFixed(2)),
      members: createdClub.members,
      tags: createdClub.tags,
      duesCycles: createdClub.duesCycles,
      claims: createdClub.claims,
      auditLogs: createdClub.auditLogs,
      createdAt: createdClub.createdAt,
    };

    return NextResponse.json({ success: true, club: formatted }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error in POST /api/clubs:", error);
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

