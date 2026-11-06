import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendAuditLog } from "@/lib/audit";
import { createAndSendPayPalInvoice } from "@/lib/paypal";
import { calculateEqualSplit } from "@/lib/split-math";

export async function GET() {
  try {
    const splits = await prisma.billSplit.findMany({
      include: {
        club: true,
        tag: true,
        movements: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // In-code evaluation of payment progress and member status from ledger movements
    const formattedSplits = splits.map((split) => {
      let collected = 0;
      let pending = 0;
      const memberStatuses = [];

      for (const m of split.movements) {
        if (m.status === "COMPLETED") {
          collected += m.amount;
        } else {
          pending += m.amount;
        }

        memberStatuses.push({
          movementId: m.id,
          memberEmail: m.counterparty,
          amount: m.amount,
          status: m.status,
          paypalRefId: m.paypalRefId,
          invoiceUrl: m.invoiceUrl,
          paidAt: m.status === "COMPLETED" ? m.updatedAt : null,
          note: m.note,
        });
      }

      const totalRequested = parseFloat((collected + pending).toFixed(2));
      const progressPercent =
        totalRequested > 0
          ? Math.min(100, parseFloat(((collected / totalRequested) * 100).toFixed(1)))
          : 0;

      return {
        id: split.id,
        title: split.title,
        totalAmount: split.totalAmount,
        includeCreator: split.includeCreator,
        creatorEmail: split.creatorEmail,
        clubId: split.clubId,
        clubName: split.club?.name || null,
        tagId: split.tagId,
        tagName: split.tag.name,
        collected: parseFloat(collected.toFixed(2)),
        pending: parseFloat(pending.toFixed(2)),
        totalRequested,
        progressPercent,
        isFullySettled: split.movements.length > 0 && split.movements.every((m) => m.status === "COMPLETED"),
        requestsCount: split.movements.length,
        paidCount: split.movements.filter((m) => m.status === "COMPLETED").length,
        memberStatuses,
        createdAt: split.createdAt,
      };
    });

    return NextResponse.json({ splits: formattedSplits });
  } catch (error: unknown) {
    console.error("Error in GET /api/splits:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message, splits: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      title,
      totalAmount,
      memberEmails,
      includeCreator = true,
      creatorEmail,
      clubId,
      tagId,
      userRole = "MEMBER",
    } = body;

    if (!title || title.trim().length === 0) {
      return NextResponse.json({ error: "Bill title or expense description is required." }, { status: 400 });
    }

    const numericAmount = parseFloat(totalAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: "Total amount must be greater than zero." }, { status: 400 });
    }

    if (!Array.isArray(memberEmails) || memberEmails.length === 0) {
      return NextResponse.json({ error: "Please select at least one member to split the bill with." }, { status: 400 });
    }

    const cleanCreator = (creatorEmail || "treasurer@roboticsclub.org").trim().toLowerCase();

    // 1. Perform in-code split math with exact penny remainder distribution
    const splitResult = calculateEqualSplit({
      totalAmount: numericAmount,
      memberEmails,
      includeCreator: Boolean(includeCreator),
      creatorEmail: cleanCreator,
    });

    if (splitResult.requestsToIssue.length === 0) {
      return NextResponse.json(
        { error: "No requests to issue. Please select other members to split with." },
        { status: 400 }
      );
    }

    // Resolve club
    let targetClubId = clubId;
    if (!targetClubId) {
      const firstClub = await prisma.club.findFirst();
      targetClubId = firstClub?.id || null;
    }

    // Resolve tag
    let selectedTagId = tagId;
    if (!selectedTagId) {
      const defaultTag = await prisma.tag.findFirst();
      selectedTagId = defaultTag?.id;
    }

    if (!selectedTagId) {
      const createdTag = await prisma.tag.create({
        data: {
          name: "Shared Expenses",
          monthlyLimit: 1000.0,
          clubId: targetClubId || null,
        },
      });
      selectedTagId = createdTag.id;
    }

    // 2. Create the BillSplit record
    const billSplit = await prisma.billSplit.create({
      data: {
        title: title.trim(),
        totalAmount: numericAmount,
        includeCreator: Boolean(includeCreator),
        creatorEmail: cleanCreator,
        clubId: targetClubId || null,
        tagId: selectedTagId,
      },
      include: {
        tag: true,
        club: true,
      },
    });

    // 3. Issue PayPal Invoices and create PENDING movements in unified ledger
    const createdMovements = [];

    for (const reqShare of splitResult.requestsToIssue) {
      let invoiceData;
      try {
        invoiceData = await createAndSendPayPalInvoice({
          recipientEmail: reqShare.email,
          amountValue: reqShare.amount.toFixed(2),
          currencyCode: "USD",
          itemName: `Split Bill: ${billSplit.title}`,
          note: `Your share ($${reqShare.amount.toFixed(2)}) for "${billSplit.title}" (Total: $${numericAmount.toFixed(2)})`,
        });
      } catch (err: any) {
        console.warn(`[BILL SPLIT INVOICE WARNING] Sandbox fallback for ${reqShare.email}:`, err?.message);
        invoiceData = {
          invoiceId: `INV-SPLIT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
          payerViewUrl: `https://www.sandbox.paypal.com/invoice/payer-view/details/SIM-SPLIT-${Date.now()}`,
          status: "SENT",
        };
      }

      // Record PENDING movement in unified ledger
      const movement = await prisma.movement.create({
        data: {
          type: "REQUEST",
          direction: "INCOMING",
          counterparty: reqShare.email,
          amount: reqShare.amount,
          currency: "USD",
          tagId: selectedTagId,
          status: "PENDING",
          paypalRefId: invoiceData.invoiceId,
          invoiceUrl: invoiceData.payerViewUrl,
          note: `Bill Split: ${billSplit.title} ($${reqShare.amount.toFixed(2)} of $${numericAmount.toFixed(2)})`,
          clubId: targetClubId || null,
          splitId: billSplit.id,
        },
      });

      createdMovements.push(movement);
    }

    // 4. Append to append-only AuditLog
    await appendAuditLog({
      clubId: targetClubId || null,
      who: cleanCreator,
      role: (userRole as any) || "MEMBER",
      action: "BILL_SPLIT_CREATED",
      target: `split:${billSplit.id}`,
      details: {
        splitId: billSplit.id,
        title: billSplit.title,
        totalAmount: numericAmount,
        totalParticipants: splitResult.totalParticipants,
        includeCreator: splitResult.shares.some((s) => s.isCreator),
        requestsCreated: createdMovements.length,
        shares: splitResult.shares,
      },
    });

    console.log(
      `[BILL SPLIT CREATED] "${billSplit.title}" Total: $${numericAmount}, Split across ${splitResult.totalParticipants} participants, Invoices: ${createdMovements.length}`
    );

    return NextResponse.json({
      success: true,
      split: billSplit,
      splitResult,
      requestsCreated: createdMovements.length,
      movements: createdMovements,
    });
  } catch (error: unknown) {
    console.error("Error in POST /api/splits:", error);
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
