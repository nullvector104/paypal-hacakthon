import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    const events = await prisma.eventFundraiser.findMany({
      include: {
        club: true,
        tag: true,
        movements: {
          where: { status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // In-code computation of progress and donors from the unified ledger
    const formattedEvents = events.map((event) => {
      let totalCollected = 0;
      const recentDonors = [];

      for (const m of event.movements) {
        if (m.direction === "INCOMING") {
          totalCollected += m.amount;
          recentDonors.push({
            id: m.id,
            contributor: m.counterparty,
            amount: m.amount,
            date: m.createdAt,
            note: m.note,
          });
        }
      }

      const progressPercent = Math.min(
        100,
        parseFloat(((totalCollected / event.goalAmount) * 100).toFixed(1))
      );
      const remaining = Math.max(0, parseFloat((event.goalAmount - totalCollected).toFixed(2)));

      return {
        id: event.id,
        title: event.title,
        description: event.description,
        goalAmount: event.goalAmount,
        status: event.status,
        clubId: event.clubId,
        clubName: event.club?.name || null,
        tagId: event.tagId,
        tagName: event.tag.name,
        totalCollected: parseFloat(totalCollected.toFixed(2)),
        progressPercent,
        remaining,
        donorCount: recentDonors.length,
        isGoalReached: totalCollected >= event.goalAmount,
        recentDonors: recentDonors.slice(0, 10),
        createdAt: event.createdAt,
      };
    });

    return NextResponse.json({ events: formattedEvents });
  } catch (error: unknown) {
    console.error("Error in GET /api/events:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message, events: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { title, description, goalAmount, clubId, userEmail, userRole } = body;

    if (!title || title.trim().length === 0) {
      return NextResponse.json({ error: "Fundraiser title is required." }, { status: 400 });
    }

    const numericGoal = parseFloat(goalAmount);
    if (isNaN(numericGoal) || numericGoal <= 0) {
      return NextResponse.json({ error: "Goal amount must be greater than zero." }, { status: 400 });
    }

    // Resolve club
    let targetClubId = clubId;
    if (!targetClubId) {
      const firstClub = await prisma.club.findFirst();
      targetClubId = firstClub?.id;
    }

    // Create or find a tag for this event
    const tagName = `Event: ${title.trim().slice(0, 25)}`;
    let tag = await prisma.tag.findUnique({
      where: { name: tagName },
    });

    if (!tag) {
      tag = await prisma.tag.create({
        data: {
          name: tagName,
          monthlyLimit: numericGoal * 1.5,
          clubId: targetClubId || null,
        },
      });
    }

    const event = await prisma.eventFundraiser.create({
      data: {
        title: title.trim(),
        description: description?.trim() || "",
        goalAmount: numericGoal,
        clubId: targetClubId || null,
        tagId: tag.id,
        status: "ACTIVE",
      },
      include: {
        club: true,
        tag: true,
      },
    });

    // Append to append-only AuditLog
    await appendAuditLog({
      clubId: targetClubId || null,
      who: userEmail || "treasurer",
      role: userRole || "TREASURER",
      action: "FUNDRAISER_CREATED",
      target: `event:${event.id}`,
      details: {
        eventId: event.id,
        title: event.title,
        goalAmount: numericGoal,
        tagName: tag.name,
      },
    });

    return NextResponse.json({
      success: true,
      event: {
        ...event,
        totalCollected: 0,
        progressPercent: 0,
        remaining: numericGoal,
        donorCount: 0,
        recentDonors: [],
      },
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/events:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
