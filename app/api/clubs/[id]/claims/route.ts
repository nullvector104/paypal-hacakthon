import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendAuditLog } from "@/lib/audit";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clubId } = await context.params;

    const claims = await prisma.reimbursementClaim.findMany({
      where: { clubId },
      orderBy: { createdAt: "desc" },
      include: {
        tag: true,
        movement: true,
      },
    });

    return NextResponse.json({ claims });
  } catch (error: unknown) {
    console.error("Error in GET /api/clubs/[id]/claims:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message, claims: [] }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clubId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const {
      requesterEmail,
      requesterName,
      amount,
      tagId,
      note,
      userRole,
    } = body;

    if (!requesterEmail || !requesterEmail.includes("@")) {
      return NextResponse.json({ error: "A valid requester email is required." }, { status: 400 });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: "Claim amount must be a positive number." }, { status: 400 });
    }

    if (!note || note.trim().length === 0) {
      return NextResponse.json({ error: "A note or explanation for the expense is required." }, { status: 400 });
    }

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: { tags: true },
    });

    if (!club) {
      return NextResponse.json({ error: "Club not found." }, { status: 404 });
    }

    // Ensure a valid expense tag is assigned
    let selectedTagId = tagId;
    if (!selectedTagId) {
      const defaultTag = club.tags[0] || (await prisma.tag.findFirst());
      selectedTagId = defaultTag?.id;
    }

    if (!selectedTagId) {
      return NextResponse.json({ error: "No expense category tag available." }, { status: 400 });
    }

    // Create the ReimbursementClaim in SUBMITTED state
    const claim = await prisma.reimbursementClaim.create({
      data: {
        clubId: club.id,
        requesterEmail: requesterEmail.trim().toLowerCase(),
        requesterName: requesterName?.trim() || requesterEmail.split("@")[0],
        amount: numericAmount,
        note: note.trim(),
        tagId: selectedTagId,
        status: "SUBMITTED",
      },
      include: { tag: true },
    });

    // Append to append-only AuditLog
    await appendAuditLog({
      clubId: club.id,
      who: requesterEmail.trim().toLowerCase(),
      role: userRole || "MEMBER",
      action: "CLAIM_SUBMITTED",
      target: `claim:${claim.id}`,
      details: {
        claimId: claim.id,
        amount: numericAmount,
        tag: claim.tag.name,
        note: claim.note,
      },
    });

    console.log(
      `[CLAIM SUBMITTED] Club: ${club.name}, Requester: ${claim.requesterEmail}, Amount: $${numericAmount}`
    );

    return NextResponse.json({
      success: true,
      claim,
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/clubs/[id]/claims:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
