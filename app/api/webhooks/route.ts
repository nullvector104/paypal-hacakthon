import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * PayPal Webhooks Listener Endpoint
 * Handles asynchronous event notifications from PayPal Sandbox:
 * - CHECKOUT.ORDER.APPROVED
 * - PAYMENT.CAPTURE.COMPLETED
 * - INVOICING.INVOICE.PAID
 * - PAYMENT.PAYOUTSBATCH.SUCCESS
 * - PAYMENT.PAYOUTS-ITEM.SUCCEEDED
 */

export async function GET() {
  return NextResponse.json({
    status: "active",
    endpoint: "PayPal Webhook Listener",
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text();
    let event: any = null;

    try {
      event = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const eventType: string = event.event_type || "";
    console.log(`[PayPal Webhook Received] Type: ${eventType}, ID: ${event.id}`);

    // Reconcile events into Unified Ledger
    switch (eventType) {
      case "PAYMENT.CAPTURE.COMPLETED": {
        const capture = event.resource;
        const captureId = capture?.id;
        const customId = capture?.custom_id;

        if (captureId) {
          await prisma.movement.updateMany({
            where: { paypalRefId: captureId },
            data: { status: "COMPLETED" },
          });
        }
        break;
      }

      case "INVOICING.INVOICE.PAID": {
        const invoice = event.resource;
        const invoiceId = invoice?.invoice?.id || invoice?.id;

        if (invoiceId) {
          await prisma.movement.updateMany({
            where: { paypalRefId: invoiceId },
            data: { status: "COMPLETED" },
          });
        }
        break;
      }

      case "PAYMENT.PAYOUTS-ITEM.SUCCEEDED": {
        const item = event.resource;
        const itemId = item?.payout_item_id;

        if (itemId) {
          await prisma.movement.updateMany({
            where: { paypalRefId: itemId },
            data: { status: "COMPLETED" },
          });
        }
        break;
      }

      default:
        console.log(`[PayPal Webhook] Unhandled event type acknowledged: ${eventType}`);
        break;
    }

    return NextResponse.json({ received: true, event_type: eventType }, { status: 200 });
  } catch (error: any) {
    console.error("[PayPal Webhook Error]:", error);
    return NextResponse.json({ error: error.message || "Webhook processing error" }, { status: 500 });
  }
}

