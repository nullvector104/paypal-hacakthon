/**
 * Server-only PayPal REST API client (Sandbox)
 * Adheres strictly to PayPal v2 checkout API standards.
 */

const PAYPAL_API_BASE =
  process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";

interface PayPalTokenCache {
  accessToken: string;
  expiresAt: number; // Unix timestamp in ms
}

let tokenCache: PayPalTokenCache | null = null;

/**
 * Retrieves a valid PayPal OAuth 2.0 Access Token using Client Credentials grant.
 * Cached in memory until expiration.
 */
export async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in server environment variables."
    );
  }

  // Return cached token if valid (with 60-second safety buffer)
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.accessToken;
  }

  const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  )}`;

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("PayPal OAuth Token Error:", response.status, errorBody);
    throw new Error(
      `Failed to authenticate with PayPal: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
  };

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

export interface PayPalItem {
  name: string;
  quantity: string;
  unit_amount: {
    currency_code: string;
    value: string;
  };
  description?: string;
}

export interface CreateOrderParams {
  amountValue: string; // e.g. "49.99"
  currencyCode?: string; // Default: "USD"
  items?: PayPalItem[];
  customId?: string; // e.g., Purchase.id for reconciliation
}

export interface PayPalOrderResponse {
  id: string;
  status: string;
  links: Array<{ href: string; rel: string; method: string }>;
}

export interface PayPalCaptureResponse {
  id: string;
  status: "COMPLETED" | "SAVED" | "APPROVED" | "VOIDED" | "PAYER_ACTION_REQUIRED";
  payment_source?: unknown;
  purchase_units?: Array<{
    reference_id: string;
    payments?: {
      captures?: Array<{
        id: string;
        status: "COMPLETED" | "DECLINED" | "PARTIALLY_REFUNDED" | "PENDING" | "REFUNDED" | "FAILED";
        amount: {
          currency_code: string;
          value: string;
        };
      }>;
    };
  }>;
}

/**
 * Creates an order with PayPal REST API v2
 */
export async function createPayPalOrder(
  params: CreateOrderParams
): Promise<PayPalOrderResponse> {
  const token = await getPayPalAccessToken();
  const currency = params.currencyCode || "USD";

  const purchaseUnit: Record<string, unknown> = {
    amount: {
      currency_code: currency,
      value: params.amountValue,
    },
  };

  if (params.customId) {
    purchaseUnit.custom_id = params.customId;
  }

  if (params.items && params.items.length > 0) {
    purchaseUnit.amount = {
      currency_code: currency,
      value: params.amountValue,
      breakdown: {
        item_total: {
          currency_code: currency,
          value: params.amountValue,
        },
      },
    };
    purchaseUnit.items = params.items;
  }

  const payload = {
    intent: "CAPTURE",
    purchase_units: [purchaseUnit],
  };

  const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("PayPal Create Order Error:", response.status, errorBody);
    throw new Error(`Failed to create PayPal order: ${response.status}`);
  }

  return (await response.json()) as PayPalOrderResponse;
}

/**
 * Captures payment for an approved PayPal order
 */
export async function capturePayPalOrder(
  orderId: string
): Promise<PayPalCaptureResponse> {
  const token = await getPayPalAccessToken();

  const response = await fetch(
    `${PAYPAL_API_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({}),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("PayPal Capture Order Error:", response.status, errorBody);
    throw new Error(`Failed to capture PayPal order: ${response.status}`);
  }

  return (await response.json()) as PayPalCaptureResponse;
}

/**
 * Retrieves order details for status inspection and reconciliation
 */
export async function getPayPalOrderDetails(orderId: string) {
  const token = await getPayPalAccessToken();

  const response = await fetch(
    `${PAYPAL_API_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("PayPal Get Order Error:", response.status, errorBody);
    throw new Error(`Failed to get PayPal order details: ${response.status}`);
  }

  return response.json();
}

/** ==========================================
 *  PAYPAL PAYOUTS V1 (Send Money / Reimbursements)
 *  ========================================== */

export interface CreatePayoutParams {
  receiverEmail: string;
  amountValue: string; // e.g. "25.00"
  currencyCode?: string; // Default: "USD"
  note?: string;
  senderBatchId?: string;
  senderItemId?: string;
}

export interface PayPalPayoutResponse {
  batchId: string;
  batchStatus: string;
  raw: unknown;
}

export async function createPayPalPayout(
  params: CreatePayoutParams
): Promise<PayPalPayoutResponse> {
  const token = await getPayPalAccessToken();
  const currency = params.currencyCode || "USD";
  const batchId =
    params.senderBatchId || `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const itemId =
    params.senderItemId || `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const payload = {
    sender_batch_header: {
      sender_batch_id: batchId,
      email_subject: "You received a payment via Orbit",
      email_message:
        params.note || "You have received a payment or club reimbursement via Orbit.",
    },
    items: [
      {
        recipient_type: "EMAIL",
        amount: {
          value: params.amountValue,
          currency: currency,
        },
        receiver: params.receiverEmail,
        note: params.note || "Payment via Orbit",
        sender_item_id: itemId,
      },
    ],
  };

  const response = await fetch(`${PAYPAL_API_BASE}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("PayPal Create Payout Error:", response.status, errorBody);
    throw new Error(
      `Failed to create PayPal payout (${response.status}): ${errorBody}`
    );
  }

  const data = await response.json();
  const payoutBatchId = data.batch_header?.payout_batch_id || batchId;
  const batchStatus = data.batch_header?.batch_status || "PENDING";

  return {
    batchId: payoutBatchId,
    batchStatus,
    raw: data,
  };
}

export async function getPayPalPayoutBatchDetails(batchId: string) {
  const token = await getPayPalAccessToken();

  const response = await fetch(
    `${PAYPAL_API_BASE}/v1/payments/payouts/${encodeURIComponent(batchId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("PayPal Get Payout Error:", response.status, errorBody);
    throw new Error(`Failed to get PayPal payout batch: ${response.status}`);
  }

  return response.json();
}

/** ==========================================
 *  PAYPAL INVOICING V2 (Request Money / Dues)
 *  ========================================== */

export interface CreateInvoiceParams {
  recipientEmail: string;
  recipientName?: string;
  amountValue: string; // e.g. "30.00"
  currencyCode?: string; // Default: "USD"
  itemName?: string;
  note?: string;
}

export interface PayPalInvoiceResponse {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  payerViewUrl: string | null;
  raw: unknown;
}

export async function createAndSendPayPalInvoice(
  params: CreateInvoiceParams
): Promise<PayPalInvoiceResponse> {
  const token = await getPayPalAccessToken();
  const currency = params.currencyCode || "USD";
  const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
  const today = new Date().toISOString().split("T")[0];

  // 1. Create draft invoice
  const draftPayload = {
    detail: {
      invoice_number: invoiceNumber,
      invoice_date: today,
      currency_code: currency,
      note: params.note || "Payment request via Orbit",
      payment_term: {
        term_type: "DUE_ON_RECEIPT",
      },
    },
    invoicer: {
      name: {
        given_name: "Orbit",
        surname: "Treasury",
      },
    },
    primary_recipients: [
      {
        billing_info: {
          name: {
            given_name: params.recipientName || "Member",
            surname: "Payer",
          },
          email_address: params.recipientEmail,
        },
      },
    ],
    items: [
      {
        name: params.itemName || "Payment Request / Dues",
        description: params.note || "Payment request via Orbit",
        quantity: "1",
        unit_amount: {
          currency_code: currency,
          value: params.amountValue,
        },
      },
    ],
  };

  const createRes = await fetch(`${PAYPAL_API_BASE}/v2/invoicing/invoices`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(draftPayload),
    cache: "no-store",
  });

  if (!createRes.ok) {
    const errorBody = await createRes.text();
    console.error("PayPal Create Invoice Error:", createRes.status, errorBody);
    throw new Error(
      `Failed to create PayPal invoice (${createRes.status}): ${errorBody}`
    );
  }

  const createdData = await createRes.json();
  const invoiceId = createdData.id;

  // 2. Dispatch / Send the invoice to recipient
  let payerViewUrl: string | null = null;

  try {
    const sendRes = await fetch(
      `${PAYPAL_API_BASE}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          send_to_recipient: true,
          send_to_invoicer: false,
        }),
        cache: "no-store",
      }
    );

    if (sendRes.ok) {
      const sendData = await sendRes.json().catch(() => ({}));
      // Find payer-view HATEOAS link
      if (sendData.links && Array.isArray(sendData.links)) {
        const link = sendData.links.find(
          (l: { rel: string }) => l.rel === "payer-view"
        );
        if (link) payerViewUrl = link.href;
      }
    } else {
      console.warn("Invoice created but send response was:", sendRes.status);
    }
  } catch (err) {
    console.warn("Error sending invoice email (draft still created):", err);
  }

  // Fallback direct sandbox payer view link if not in response
  if (!payerViewUrl) {
    payerViewUrl = `https://www.sandbox.paypal.com/invoice/payer-view/details/${invoiceId}`;
  }

  return {
    invoiceId,
    invoiceNumber,
    status: "SENT",
    payerViewUrl,
    raw: createdData,
  };
}

export async function getPayPalInvoiceDetails(invoiceId: string) {
  const token = await getPayPalAccessToken();

  const response = await fetch(
    `${PAYPAL_API_BASE}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("PayPal Get Invoice Error:", response.status, errorBody);
    throw new Error(`Failed to get PayPal invoice: ${response.status}`);
  }

  return response.json();
}

/**
 * Records an external or manual payment against a sandbox invoice for simulation
 */
export async function recordPayPalInvoicePayment(
  invoiceId: string,
  amountValue: string,
  currencyCode = "USD"
) {
  const token = await getPayPalAccessToken();

  const payload = {
    method: "OTHER",
    payment_type: "PAYPAL",
    amount: {
      currency_code: currencyCode,
      value: amountValue,
    },
    payment_date: new Date().toISOString().split("T")[0],
    note: "Simulated sandbox payment via Orbit",
  };

  const response = await fetch(
    `${PAYPAL_API_BASE}/v2/invoicing/invoices/${encodeURIComponent(
      invoiceId
    )}/payments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("PayPal Record Payment Error:", response.status, errorBody);
    throw new Error(`Failed to record invoice payment: ${response.status}`);
  }

  return response.json();
}

