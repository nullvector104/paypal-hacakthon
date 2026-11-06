import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAndSendPayPalInvoice } from "@/lib/paypal";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      recipientEmail,
      recipientName,
      amount,
      tagId,
      note,
      clubId,
      userRole, // "TREASURER" or "MEMBER"
    } = body;

    // 1. Validation
    if (!recipientEmail || typeof recipientEmail !== "string" || !recipientEmail.includes("@")) {
      return NextResponse.json({ error: "A valid recipient email is required." }, { status: 400 });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number." }, { status: 400 });
    }

    const amountValue = numericAmount.toFixed(2);
    const currency = "USD";

    // 2. Server-side role check for Club Treasury dues
    if (clubId) {
      if (userRole !== "TREASURER") {
        return NextResponse.json(
          {
            error:
              "Unauthorized: Only the Treasurer can issue membership dues or club invoice requests.",
          },
          { status: 403 }
        );
      }

      const club = await prisma.club.findUnique({
        where: { id: clubId },
      });
      if (!club) {
        return NextResponse.json({ error: "Club not found." }, { status: 404 });
      }
    }

    // 3. Ensure a valid Tag is selected
    let selectedTagId = tagId;
    if (!selectedTagId) {
      let defaultTag = await prisma.tag.findFirst({
        where: { name: "Other" },
      });
      if (!defaultTag) {
        defaultTag = await prisma.tag.create({
          data: { name: "Other", monthlyLimit: 100.0 },
        });
      }
      selectedTagId = defaultTag.id;
    } else {
      const tagExists = await prisma.tag.findUnique({
        where: { id: selectedTagId },
      });
      if (!tagExists) {
        return NextResponse.json({ error: "Selected tag does not exist." }, { status: 400 });
      }
    }

    const cleanEmail = recipientEmail.trim().toLowerCase();

    // 4. STEP A: RECORD PENDING ROW FIRST IN UNIFIED LEDGER
    const draftRefId = `INV-DRAFT-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const movement = await prisma.movement.create({
      data: {
        type: "REQUEST",
        direction: "INCOMING",
        counterparty: cleanEmail,
        amount: numericAmount,
        currency,
        tagId: selectedTagId,
        status: "PENDING",
        paypalRefId: draftRefId,
        note: note || (clubId ? "Club Dues Request" : "Direct Request"),
        clubId: clubId || null,
      },
      include: {
        tag: true,
        club: true,
      },
    });

    console.log(
      `[REQUEST STEP 1: PENDING RECORDED] Movement ID: ${movement.id}, Recipient: ${cleanEmail}, DraftRef: ${draftRefId}`
    );

    // 5. STEP B: CALL PAYPAL INVOICING V2 API
    try {
      const invoiceResult = await createAndSendPayPalInvoice({
        recipientEmail: cleanEmail,
        recipientName: recipientName || "Member",
        amountValue,
        currencyCode: currency,
        itemName: clubId ? "Club Membership Dues" : "Payment Request",
        note: note || (clubId ? "Monthly club membership dues via Orbit" : "Payment request via Orbit"),
      });

      // 6. STEP C: UPDATE STATUS AND REAL PAYPAL REF FROM PAYPAL'S RESPONSE
      const updatedMovement = await prisma.movement.update({
        where: { id: movement.id },
        data: {
          status: "PENDING",
          paypalRefId: invoiceResult.invoiceId,
          invoiceUrl: invoiceResult.payerViewUrl,
        },
        include: {
          tag: true,
          club: true,
        },
      });

      console.log(
        `[REQUEST STEP 2: PAYPAL RESPONDED] Movement: ${updatedMovement.id}, PayPal Invoice: ${invoiceResult.invoiceId}, PayerView: ${invoiceResult.payerViewUrl}`
      );

      return NextResponse.json({
        success: true,
        movement: updatedMovement,
        payerViewUrl: invoiceResult.payerViewUrl,
      });
    } catch (err: unknown) {
      console.error("PayPal Invoicing failed:", err);
      const msg = err instanceof Error ? err.message : "PayPal Invoicing error";

      await prisma.movement.update({
        where: { id: movement.id },
        data: {
          status: "FAILED",
          note: `${movement.note || ""} [PayPal Invoicing Error: ${msg.slice(0, 150)}]`.trim(),
        },
      });

      return NextResponse.json(
        { error: msg, movementId: movement.id, status: "FAILED" },
        { status: 502 }
      );
    }
  } catch (error: unknown) {
    console.error("Error in POST /api/movements/request:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
