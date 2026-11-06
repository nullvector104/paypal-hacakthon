# Orbit — PayPal Hackathon Prototype (`paypal-hacakthon`)

> **Disclaimer:** Independent prototype, not an official PayPal product. Sandbox only; never ask for or enter live PayPal login details.

Orbit is a concept payments and treasury application built with Next.js (App Router), Prisma, Neon PostgreSQL, and PayPal Sandbox APIs. It unifies cart purchases, direct peer sends, invoice requests, and community club treasury into a single server-authoritative ledger with monthly expense budget tracking.

---

## Architecture Overview

### 1. Two-Column Dashboard (No external logos)
* **Top Navigation Bar**: Brand identity (`ORBIT`), Role Switcher (`Treasurer` / `Member`), and primary action pills (`+ Send`, `↓ Request`).
* **Left Column**:
  * **Shopping Cart & Channel3 Catalog**: Browse live products from Channel3, add to cart, and checkout with server-calculated totals.
  * **Clubs & Treasury**: Treasury balance tracking, member dues requests, and expense reimbursements with server-side role enforcement.
* **Right Column**:
  * **This Month's Tags**: Monthly category budget tracking (Food, Electronics, Travel, etc.) with real-time visual progress bars and automatic threshold warnings at **80%** and **100%**.
  * **Recent Activity (Unified Ledger)**: A single authoritative ledger recording all money movements (`CART_PAYMENT`, `SEND`, `REQUEST`).

---

## Unified Ledger (`Movement` Table)

Every transaction is recorded authoritatively on the server in the `Movement` table:
* `type`: `CART_PAYMENT` | `SEND` | `REQUEST`
* `direction`: `OUTGOING` (Cart payments, Sends) | `INCOMING` (Dues/Requests)
* `counterparty`: Merchant name, recipient email, or payer email
* `amount`: Stored as server-validated Float
* `tagId`: Mandatory relation to an expense `Tag`
* `status`: `PENDING` $\rightarrow$ `COMPLETED` | `FAILED` | `CANCELLED`
* `paypalRefId`: PayPal Order ID, Payout Batch ID, or Invoice ID
* `invoiceUrl`: Direct `payer-view` link for invoice payments
* `createdAt`: UTC timestamp

---

## PayPal API Integration

1. **Send Money & Club Reimbursements**:
   * Uses **PayPal Payouts REST API v1** (`POST /v1/payments/payouts`).
   * Disburses funds directly from the sandbox business account.
   * Decrements club balance when marked COMPLETED.
2. **Request Money & Club Dues**:
   * Uses **PayPal Invoicing v2 API** (`POST /v2/invoicing/invoices` and `POST /v2/invoicing/invoices/{id}/send`).
   * Provides direct `payer-view` URL for recipients to view and pay.
   * Increments club treasury balance upon payment.
3. **Cart Checkout**:
   * Uses **PayPal Orders v2 API** (`POST /v2/checkout/orders` and `POST /v2/checkout/orders/{id}/capture`).
   * Evaluates cart items strictly on the server from the database cart.
4. **Server-Enforced Role Checks**:
   * Treasurer-only actions (reimbursements and dues requests) verify `userRole === "TREASURER"` on the server. If a `MEMBER` attempts to trigger them, the server rejects with HTTP 403 Forbidden.

---

## How to Test

### 1. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Test Shopping Cart & Checkout
1. Switch to **Browse Catalog** tab in the Shopping Cart tile.
2. Search for `coffee` or `headphones` and click **+ Add**.
3. Switch back to **Cart** tab. Notice the server-calculated total and tag selector.
4. If the cart total pushes the tag over 80% or 100%, observe the real-time alert banner.
5. Click **⚡ Instant Dev Test Payment** to create the order, mark it `COMPLETED`, and see it appear in the **Recent Activity** ledger!
   *(Or click the PayPal button to test with a US Personal Sandbox buyer account).*

### 3. Test Send Money (PayPal Payouts v1)
1. Click the **+ Send** pill button in the top navigation.
2. Enter recipient email (e.g. `member@roboticsclub.org`), amount (e.g. `$25.00`), select a Tag (e.g. `Club Hardware`), and submit.
3. The server calls PayPal Payouts API and records a `SEND` movement with `paypalRefId` in the ledger.

### 4. Test Request Money & Dues (PayPal Invoicing v2)
1. Click the **↓ Request** pill button (or **Request Member Dues** in the Clubs tile).
2. Enter recipient email (e.g. `jordan@roboticsclub.org`), amount (e.g. `$35.00`), and submit.
3. The server calls PayPal Invoicing v2 API and generates an invoice with a direct `payer-view` URL.
4. In the **Recent Activity** ledger, click **View Invoice ↗** to view the invoice or click **Mark Paid** to simulate a completed payment.
5. Watch the invoice status flip to `COMPLETED` and the Club Treasury balance increase!

### 5. Test Role Enforcement (Treasurer vs Member)
1. In the top bar, toggle the role switcher from **Treasurer** to **Member**.
2. Click **Request Member Dues** or **Reimburse Member** in the Clubs tile.
3. Observe the server-level protection: the action is rejected with a 403 Forbidden notification.
