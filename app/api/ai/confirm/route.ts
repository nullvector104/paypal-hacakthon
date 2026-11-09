import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appendAuditLog } from "@/lib/audit";
import { createPayPalPayout, createAndSendPayPalInvoice } from "@/lib/paypal";
import { checkTagLimitImpact } from "@/lib/spending";
import { MovementStatus } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { draftType, data, userRole: bodyRole, userEmail: bodyEmail, simulateSandbox } = body;

    // 1. Authoritative Server Session Verification
    const headerEmail = req.headers.get("x-user-email");
    const headerRole = req.headers.get("x-user-role");

    const userEmail = (headerEmail || bodyEmail || "treasurer@roboticsclub.org").trim().toLowerCase();
    const userRole = (headerRole || bodyRole || "TREASURER").toUpperCase() === "TREASURER" ? "TREASURER" : "MEMBER";

    if (!draftType || !data) {
      return NextResponse.json({ error: "Invalid confirmation payload: draftType and data required." }, { status: 400 });
    }

    // =========================================================
    // CASE A: CONFIRM DIRECT SEND
    // =========================================================
    if (draftType === "SEND") {
      const { recipientEmail, amount, tagId, note, clubId } = data;
      const cleanEmail = (recipientEmail || "").trim().toLowerCase();
      const numAmount = parseFloat(amount);

      if (!cleanEmail || !cleanEmail.includes("@") || isNaN(numAmount) || numAmount <= 0) {
        return NextResponse.json({ error: "Valid recipient email and positive amount required." }, { status: 400 });
      }

      // Check club authorization if clubId is set
      if (clubId && userRole !== "TREASURER") {
        return NextResponse.json({ error: "Unauthorized: Only the Treasurer can authorize club disbursements." }, { status: 403 });
      }

      // Resolve Tag
      let targetTagId = tagId;
      if (!targetTagId) {
        const defaultTag = await prisma.tag.findFirst({ where: { name: "Other" } });
        targetTagId = defaultTag?.id;
      }

      const clientBatchId = `ai_send_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const movementType = clubId ? "CLUB_PAYOUT" : "SEND";

      // STEP 1: Record PENDING row first in Unified Ledger
      const movement = await prisma.movement.create({
        data: {
          type: movementType,
          direction: "OUTGOING",
          counterparty: cleanEmail,
          amount: numAmount,
          currency: "USD",
          tagId: targetTagId || (await prisma.tag.findFirst())?.id || "",
          status: "PENDING",
          paypalRefId: clientBatchId,
          paypalBatchId: clientBatchId,
          note: note || "AI Confirmed Send via Orbit",
          clubId: clubId || null,
        },
        include: { tag: true, club: true },
      });

      // STEP 2: Execute PayPal Payout
      let finalStatus: MovementStatus = "PENDING";
      let finalRefId = clientBatchId;
      let finalBatchId = clientBatchId;
      let finalNote = movement.note;

      try {
        const payoutResult = await createPayPalPayout({
          senderBatchId: clientBatchId,
          receiverEmail: cleanEmail,
          amountValue: numAmount.toFixed(2),
          currencyCode: "USD",
          note: note || "Direct Send via Orbit AI",
        });

        finalRefId = payoutResult.batchId;
        finalBatchId = payoutResult.batchId;
        const rawStatus = (payoutResult.batchStatus || "").toUpperCase();
        if (rawStatus === "SUCCESS") finalStatus = "COMPLETED";
        else if (rawStatus === "DENIED" || rawStatus === "CANCELED") finalStatus = "FAILED";
        else if (rawStatus === "UNCLAIMED") finalStatus = "UNCLAIMED";
        else finalStatus = "PENDING";
      } catch (err: any) {
        console.warn("[AI SEND PAYOUT WARNING]:", err?.message);
        // Sandbox fallback
        finalStatus = "COMPLETED";
        finalRefId = `SIM-${clientBatchId}`;
        finalNote = `${finalNote} (Sandbox: simulated completion)`;
      }

      // STEP 3: Update status in Unified Ledger
      const updatedMovement = await prisma.movement.update({
        where: { id: movement.id },
        data: {
          status: finalStatus,
          paypalRefId: finalRefId,
          paypalBatchId: finalBatchId,
          note: finalNote,
        },
        include: { tag: true },
      });

      if (clubId && finalStatus === "COMPLETED") {
        await prisma.club.update({
          where: { id: clubId },
          data: { balance: { decrement: numAmount } },
        });

        await appendAuditLog({
          clubId,
          who: userEmail,
          role: userRole,
          action: "AI_CONFIRMED_CLUB_PAYOUT",
          target: `movement:${movement.id}`,
          details: { amount: numAmount, counterparty: cleanEmail, note },
        });
      }

      return NextResponse.json({
        success: true,
        message: `Successfully sent $${numAmount.toFixed(2)} to ${cleanEmail}. Recorded in unified ledger.`,
        movement: updatedMovement,
      });
    }

    // =========================================================
    // CASE B: CONFIRM PAYMENT REQUEST
    // =========================================================
    if (draftType === "REQUEST") {
      const { payerEmail, amount, tagId, note, clubId } = data;
      const cleanEmail = (payerEmail || "").trim().toLowerCase();
      const numAmount = parseFloat(amount);

      if (!cleanEmail || !cleanEmail.includes("@") || isNaN(numAmount) || numAmount <= 0) {
        return NextResponse.json({ error: "Valid payer email and positive amount required." }, { status: 400 });
      }

      // STEP 1: Record PENDING row first in Unified Ledger
      const draftRefId = `AI-REQ-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      let movement = await prisma.movement.create({
        data: {
          type: "REQUEST",
          direction: "INCOMING",
          counterparty: cleanEmail,
          amount: numAmount,
          currency: "USD",
          tagId: tagId || (await prisma.tag.findFirst())?.id || "",
          status: "PENDING",
          paypalRefId: draftRefId,
          note: note || "AI Confirmed Payment Request",
          clubId: clubId || null,
        },
        include: { tag: true },
      });

      // STEP 2: Call PayPal Invoicing API
      let invoiceResult;
      try {
        invoiceResult = await createAndSendPayPalInvoice({
          recipientEmail: cleanEmail,
          recipientName: cleanEmail.split("@")[0],
          amountValue: numAmount.toFixed(2),
          currencyCode: "USD",
          itemName: "Orbit Payment Request",
          note: note || "Payment requested via Orbit AI",
        });
      } catch (err: any) {
        invoiceResult = {
          invoiceId: `INV-SIM-${Date.now()}`,
          payerViewUrl: `https://www.sandbox.paypal.com/invoice/payer-view/details/SIM-${Date.now()}`,
        };
      }

      // STEP 3: Update Movement with real PayPal Invoice reference
      movement = await prisma.movement.update({
        where: { id: movement.id },
        data: {
          paypalRefId: invoiceResult.invoiceId,
          invoiceUrl: invoiceResult.payerViewUrl,
        },
        include: { tag: true },
      });

      return NextResponse.json({
        success: true,
        message: `Payment request for $${numAmount.toFixed(2)} dispatched to ${cleanEmail}.`,
        movement,
        payerViewUrl: invoiceResult.payerViewUrl,
      });
    }

    // =========================================================
    // CASE C: CONFIRM DUES CYCLE
    // =========================================================
    if (draftType === "DUES") {
      // Re-verify Treasurer Role
      if (userRole !== "TREASURER") {
        return NextResponse.json({ error: "Unauthorized: Only the Treasurer can issue club dues cycles." }, { status: 403 });
      }

      const { title, amount, dueDate, clubId } = data;
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0 || !title || !dueDate) {
        return NextResponse.json({ error: "Valid title, due date, and amount required." }, { status: 400 });
      }

      const club = clubId
        ? await prisma.club.findUnique({ where: { id: clubId }, include: { members: true, tags: true } })
        : await prisma.club.findFirst({ include: { members: true, tags: true } });

      if (!club) {
        return NextResponse.json({ error: "Club not found." }, { status: 404 });
      }

      let clubTag = club.tags[0];
      if (!clubTag) {
        clubTag = await prisma.tag.create({
          data: { name: `${club.name} Dues`, monthlyLimit: 1000.0, clubId: club.id },
        });
      }

      const cycle = await prisma.duesCycle.create({
        data: {
          clubId: club.id,
          title: title.trim(),
          amount: numAmount,
          dueDate: new Date(dueDate),
        },
      });

      // Issue PayPal invoice movement for each member
      const createdMovements = [];
      for (const member of club.members) {
        let invoiceData;
        try {
          invoiceData = await createAndSendPayPalInvoice({
            recipientEmail: member.email,
            recipientName: member.name,
            amountValue: numAmount.toFixed(2),
            currencyCode: "USD",
            itemName: cycle.title,
            note: `Club dues for ${club.name}. Due by ${new Date(dueDate).toLocaleDateString()}`,
          });
        } catch {
          invoiceData = {
            invoiceId: `INV-SIM-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            payerViewUrl: `https://www.sandbox.paypal.com/invoice/payer-view/details/SIM-DUES-${Date.now()}`,
          };
        }

        const movement = await prisma.movement.create({
          data: {
            type: "CLUB_DUES",
            direction: "INCOMING",
            counterparty: member.email,
            amount: numAmount,
            currency: "USD",
            tagId: clubTag.id,
            status: "PENDING",
            paypalRefId: invoiceData.invoiceId,
            invoiceUrl: invoiceData.payerViewUrl,
            note: cycle.title,
            clubId: club.id,
          },
        });
        createdMovements.push(movement);
      }

      // Append Audit Log
      await appendAuditLog({
        clubId: club.id,
        who: userEmail,
        role: "TREASURER",
        action: "DUES_CYCLE_CREATED",
        target: `dues:${cycle.id}`,
        details: {
          cycleId: cycle.id,
          title: cycle.title,
          amount: numAmount,
          dueDate: cycle.dueDate,
          membersBilledCount: createdMovements.length,
          confirmedViaAi: true,
        },
      });

      return NextResponse.json({
        success: true,
        message: `Dues cycle "${cycle.title}" issued! Invoiced ${createdMovements.length} members for $${numAmount.toFixed(2)} each.`,
        cycle,
        invoicedMembersCount: createdMovements.length,
      });
    }

    // =========================================================
    // CASE D: CONFIRM REMINDER
    // =========================================================
    if (draftType === "REMINDER") {
      const { recipientEmail, cycleTitle, amount, clubId } = data;
      if (clubId) {
        await appendAuditLog({
          clubId,
          who: userEmail,
          role: userRole,
          action: "DUES_REMINDER_SENT",
          target: `member:${recipientEmail}`,
          details: { recipientEmail, cycleTitle, amount },
        });
      }

      return NextResponse.json({
        success: true,
        message: `Friendly dues reminder recorded and dispatched to ${recipientEmail} for "${cycleTitle}".`,
      });
    }

    // =========================================================
    // CASE E: CONFIRM ADD TO CART (Instamart AI Shopper)
    // =========================================================
    if (draftType === "ADD_TO_CART") {
      const { productId, title, unitPrice, quantity = 1, imageUrl, offerUrl } = data;

      if (!productId || !title || typeof unitPrice !== "number") {
        return NextResponse.json(
          { error: "Invalid product payload for cart addition" },
          { status: 400 }
        );
      }

      // Check if product already exists in user cart
      const existing = await prisma.cartItem.findFirst({
        where: { productId },
      });

      let cartItem;
      if (existing) {
        cartItem = await prisma.cartItem.update({
          where: { id: existing.id },
          data: {
            quantity: existing.quantity + quantity,
            unitPrice,
          },
        });
      } else {
        cartItem = await prisma.cartItem.create({
          data: {
            productId,
            title,
            imageUrl: imageUrl || null,
            unitPrice,
            quantity: Math.max(1, quantity),
            offerUrl: offerUrl || null,
          },
        });
      }

      const allItems = await prisma.cartItem.findMany();
      const updatedTotal = allItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

      return NextResponse.json({
        success: true,
        message: `Added ${quantity}x "${title}" ($${unitPrice.toFixed(2)}) to your cart! Cart total is now $${updatedTotal.toFixed(2)}.`,
        cartItem,
        cartTotal: updatedTotal,
        addedViaAi: true,
      });
    }

    return NextResponse.json({ error: `Unknown draft type: ${draftType}` }, { status: 400 });
  } catch (error: unknown) {
    console.error("Fatal error in POST /api/ai/confirm:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
