# 🌌 PayPal Orbit — Enterprise Multi-Entity Treasury, Global Spend Management & AI Autonomous Commerce

[![Live Demo](https://img.shields.io/badge/Live_Demo-Vercel-000000?style=for-the-badge&logo=vercel)](https://paypal-hacakthon-apw2.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/Neon-PostgreSQL-00E599?style=for-the-badge&logo=postgresql)](https://neon.tech/)
[![PayPal](https://img.shields.io/badge/PayPal-Sandbox_APIs-003087?style=for-the-badge&logo=paypal)](https://developer.paypal.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

> 🚀 **LIVE DEPLOYMENT:**  
> **Explore the live app:** [https://paypal-hacakthon-apw2.vercel.app/](https://paypal-hacakthon-apw2.vercel.app/)

> ⚠️ **DEVELOPER & EVALUATION NOTICE:**  
> **This project is an advanced prototype designed for the PayPal AI Global Hackathon.**  
> It showcases the next generation of PayPal: bridging consumer checkouts with multi-organization corporate treasury, real-time ledger accounting, and AI agentic orchestration.  
> **Always use sandbox accounts.** Never provide live PayPal production credentials.

---

## 💡 The Problem with Modern Corporate & Organization Payments

Today, global businesses, distributed remote teams, non-profits, decentralized communities, and organizations juggle disjointed tools:
* **Fragmented Payment Rails**: Corporate credit cards, manual wire transfers, batch payouts, and invoice tracking exist in isolated silos.
* **Lack of Real-Time Spend Guardrails**: Department leads and teams discover budget overruns at month-end statement reconciliation rather than at the point of transaction.
* **Complex Multi-Entity Management**: Organizations operating across multiple business units, branches, initiatives, or regional teams must juggle disparate logins and ledgers.
* **Lack of Agentic Automation**: Traditional payment systems require manual invoice drafting, manual categorization, and repetitive approval chains.

---

## 🚀 The Solution: What is PayPal Orbit?

**PayPal Orbit** is an enterprise-grade extension to the PayPal ecosystem that transforms PayPal from a transaction processor into a **comprehensive, autonomous treasury operating system**. 

Orbit unifies commercial cart checkouts, peer-to-peer transfers, global contractor payouts, enterprise invoicing, and multi-entity vault management into a single **server-authoritative, immutable ledger**.

### 🌟 Core Pillars

1. **🏢 Multi-Organization / Entity Hub & Dynamic Switcher**
   - Manage cross-organizational treasuries (e.g. *Global Engineering Org*, *Design & Media Collective*, *Operations & Facilities*, *Regional Subsidiaries*) from a unified command interface.
   - Provision new organizations and initialize dedicated operational vaults with pre-allocated budgets in seconds.

2. **⚡ Unified Multi-Rail Settlement Engine**
   - **Point-of-Sale & Commerce (Orders v2)**: Instant inventory purchase and capture.
   - **Global Vendor & Member Disbursements (Payouts v1)**: Direct bulk and single-recipient treasury disbursements with real-time vault balance deductions.
   - **Receivables & B2B Billing (Invoicing v2)**: Programmatic invoice dispatch with direct `payer-view` settlement links.

3. **🤖 Autonomous AI Financial Copilot (Agentic Action Execution)**
   - Translates conversational human intent into validated, multi-step financial operations.
   - Automatically parses counterparty history, drafts payment orders, assigns tax/accounting category tags, and halts for user confirmation before executing financial movements.

4. **📊 Real-Time Proactive Budget Guardrails**
   - Dynamic threshold monitoring on every category budget tag.
   - Visual early-warning triggers at **80%** (Budget Warning) and hard circuit-breaker notifications at **100%** (Budget Exceeded) before funds leave the vault.

5. **🛡️ Server-Enforced Role Governance & Immutable Audit Logging**
   - Cryptographic server verification distinguishing **Treasurer / Financial Officer** privileges from **Member / Team Contributor** access.
   - Append-only immutable audit trail ensuring zero unauthorized tampering.

---

## 🏛️ System Architecture

Orbit employs a **Server-Authoritative Ledger Architecture**, ensuring financial truth is strictly maintained on the backend:

```mermaid
flowchart TD
    User([👤 Global User / Financial Officer / Team Member]) <--> ClientApp[🖥️ Next.js 15 Enterprise Client]
    
    subgraph ExperienceLayer [Intelligent Experience Layer]
        ClientApp <--> Copilot[✨ Orbit AI Agent / Copilot]
        ClientApp <--> EntitySwitcher[🏢 Multi-Organization Selector]
        ClientApp <--> BudgetEngine[📊 Real-Time Threshold Guardrails]
        ClientApp <--> FeedbackUI[🎉 Interactive Motion & Feedback UI]
    end

    ClientApp <--> APIRoutes[⚡ Serverless API Route Handlers]

    subgraph SecurityCore [Server-Authoritative Governance Core]
        APIRoutes <--> AuthGuard{🛡️ RBAC Policy Engine<br/>Officer vs Contributor}
        AuthGuard -- Authorized --> LedgerCore[📖 Unified Movement Ledger]
        APIRoutes <--> AuditTrail[🔒 Append-Only Immutable Audit Log]
        LedgerCore <--> PrismaORM[Prisma ORM Client]
        PrismaORM <--> CloudPostgres[(🐘 High-Availability PostgreSQL)]
    end

    subgraph ExternalEcosystem [PayPal Global Infrastructure & AI]
        APIRoutes <-->|Orders v2 API| PPOrders[💳 PayPal Global Checkout]
        APIRoutes <-->|Payouts v1 API| PPPayouts[💸 PayPal Global Payouts]
        APIRoutes <-->|Invoicing v2 API| PPInvoices[📄 PayPal Enterprise Invoicing]
        APIRoutes <-->|Commerce Catalog| Channel3API[🛒 Channel3 E-Commerce Engine]
        Copilot <-->|Function Calling| LLMPlatform[🧠 Advanced LLM Reasoning Engine]
    end
```

---

## 📊 Unified Ledger Schema (`Movement` Model)

Every monetary transaction across all entities flows through a single server-validated ledger model:

| Field | Type | Description |
|---|---|---|
| `id` | `String (CUID)` | Global unique transaction identifier |
| `type` | `Enum` | `CART_PAYMENT` \| `SEND` \| `REQUEST` \| `CLUB_DUES` \| `CLUB_PAYOUT` |
| `direction` | `Enum` | `OUTGOING` (Disbursements, Purchases) \| `INCOMING` (Receivables, Invoices) |
| `counterparty` | `String` | Authenticated recipient email, vendor name, or corporate billing address |
| `amount` | `Float` | Server-validated transaction total |
| `currency` | `String` | Multi-currency indicator (`USD`, `EUR`, `GBP`) |
| `tagId` | `FK -> Tag` | Linked corporate accounting category tag |
| `status` | `Enum` | `PENDING` $\rightarrow$ `COMPLETED` \| `FAILED` \| `CANCELLED` |
| `paypalRefId` | `String (Unique)` | PayPal Order ID, Payout Item ID, or Invoice ID |
| `clubId` | `FK -> Club` | Associated Organization / Subsidiary Vault |
| `createdAt` | `DateTime` | Immutable UTC transaction timestamp |

---

## 🔑 Setting Up Your Own Sandbox Credentials

Orbit requires **your own API keys and accounts** to run in sandbox mode:

### 1. PayPal Developer Sandbox
1. Go to the [PayPal Developer Dashboard](https://developer.paypal.com/).
2. Create or verify:
   - **One Business Account** (represents the enterprise treasury vault sender).
   - **One Personal Account** (represents a buyer, employee, or billing recipient).
3. Under **Apps & Credentials**, create a Sandbox App and retrieve:
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`

### 2. Cloud PostgreSQL Database (Neon)
1. Provision a free PostgreSQL instance on [Neon.tech](https://neon.tech).
2. Copy your connection URL (`postgresql://user:pass@ep-sample.neon.tech/neondb?sslmode=require`).

### 3. AI / LLM Reasoning Engine
1. Obtain an API key from [Google AI Studio](https://aistudio.google.com/) for Gemini models, or OpenAI.

---

## 🚀 Quickstart Guide

### 1. Clone & Configure
```bash
git clone https://github.com/nullvector104/paypal-hacakthon.git
cd paypal-hacakthon
```

Copy the environment template:
```bash
# Windows
copy .env.example .env.local

# macOS / Linux
cp .env.example .env.local
```

Populate `.env.local` with your sandbox keys:
```env
# Database
DATABASE_URL="postgresql://user:password@ep-sample.neon.tech/neondb?sslmode=require"

# PayPal Sandbox
PAYPAL_API_BASE="https://api-m.sandbox.paypal.com"
PAYPAL_CLIENT_ID="your_sandbox_client_id_here"
PAYPAL_CLIENT_SECRET="your_sandbox_client_secret_here"
NEXT_PUBLIC_PAYPAL_CLIENT_ID="your_sandbox_client_id_here"

# Webhooks (Optional)
PAYPAL_WEBHOOK_ID="your_webhook_id_here"

# AI Reasoning Engine
LLM_PROVIDER="gemini"
LLM_MODEL="gemini-2.5-flash"
LLM_API_KEY="your_ai_api_key_here"
```

### 2. Install & Sync Schema
```bash
npm install
npx prisma generate
npx prisma db push
```

### 3. Launch Development Server
```bash
npm run dev
# Or on Windows if PowerShell restricts scripts:
cmd /c "npm run dev"
```

Access the dashboard at [http://localhost:3000](http://localhost:3000).

---

## 🧪 Enterprise Verification Scenarios

| Test Case | Interaction Steps | Expected Production Result |
|---|---|---|
| **Multi-Entity Provisioning** | Click the Organization Selector $\rightarrow$ Choose `+ Add New Organization...` | Creates organization vault, designates lead financial officer, provisions budget tags, records initial seed funding in ledger. |
| **Instant POS Checkout** | Add items from Catalog $\rightarrow$ Select **⚡ Instant Dev Test Payment** | Validates cart on server, captures order, updates ledger, displays celebratory tick-mark animation. |
| **PayPal Sandbox Buyer Capture** | Select standard PayPal smart button $\rightarrow$ Authenticate with US Sandbox Personal account | Authorizes and captures order through PayPal Orders v2 sandbox endpoints. |
| **Global Member Disbursement** | Click `+ Send` $\rightarrow$ Specify recipient, amount, category tag | Invokes PayPal Payouts v1; immediately deducts from organization vault balance and updates activity feed. |
| **B2B Invoice Creation** | Click `↓ Request` $\rightarrow$ Submit billing invoice | Calls PayPal Invoicing v2; creates dynamic invoice with direct `payer-view` settlement link. |
| **Role-Based Circuit Breaker** | Toggle top navigation switch to **Member View** $\rightarrow$ Attempt to approve claims or request funds | Action blocked with server-level `403 Forbidden` notification. |

---

## ⚡ Architecture Spotlight: Resilience Beyond Webhooks (Optimistic Direct Reconciliation)

During sandbox development and integration, setting up external public webhooks across firewalls, tunnels, and local environments often presents friction (interstitial warning gates, validation timeouts, and DNS probe delays). Rather than allowing payment pipelines to freeze or become fragile due to external webhook drops, **Orbit is engineered with a Zero-Dependency Synchronous Reconciliation Architecture**:

```mermaid
sequenceDiagram
    autonumber
    actor User as Buyer / Treasurer
    participant Client as Next.js 15 App
    participant Engine as Orbit Backend Ledger
    participant PayPal as PayPal Sandbox REST API

    User->>Client: Authorizes Order / Payout / Invoice
    Client->>Engine: POST /api/orders (or /api/payouts)
    Engine->>PayPal: Direct API Invocation (v2 Orders / v1 Payouts)
    PayPal-->>Engine: 200 OK + Authoritative Transaction RefId
    Engine->>Engine: Atomic In-Memory Reconciliation & Ledger Commit
    Engine-->>Client: Real-Time Optimistic Response + Instant Success State
    Note over Client,Engine: Zero dependency on asynchronous webhook arrival
    opt Webhook Notification
        PayPal-->>Engine: POST /api/webhooks (Idempotent State Sync)
        Engine->>Engine: Idempotency Check (No duplicate double-spend)
    end
```

### Why This Design Outperforms Pure Webhook-Dependent Systems:
1. **Instant User Feedback & Zero Stalling:** Payments, dues invoices, and peer reimbursements achieve immediate state finality upon PayPal's authoritative API return—bypassing the 5–30 second queue delay typical of external asynchronous webhook brokers.
2. **Idempotent Dual-Verification:** If external webhooks (`/api/webhooks`) are connected (e.g. via ngrok or production DNS), they act as a supplementary reconciliation layer. Orbit's unique `paypalRefId` constraint guarantees that events are processed idempotently without double-crediting balances.
3. **Local & Cloud Portability:** Hackathon evaluators and developers can clone the repository, provide their PayPal Client credentials, and run the entire ecosystem locally without needing reverse tunnels or public URL provisioning.

---

## 📁 Project Architecture

```
├── app/
│   ├── api/
│   │   ├── ai/            # AI command parser & confirmation handlers
│   │   ├── cart/          # Server-validated commerce operations
│   │   ├── clubs/         # Multi-entity treasury, dues cycles, claims & ledger
│   │   ├── movements/     # Unified money movement (Send, Request, Simulate)
│   │   ├── orders/        # PayPal Orders v2 capture & verification
│   │   ├── tags/          # Category spending tags & threshold limits
│   │   └── webhooks/      # Asynchronous PayPal event listeners
│   ├── globals.css        # Enterprise styling, motion keyframes & status badges
│   ├── layout.tsx         # Root layout with PayPal SDK context provider
│   └── page.tsx           # Global Treasury & Financial Operations Console
├── lib/
│   ├── audit.ts           # Append-only immutable audit trail logger
│   ├── llm.ts             # Multi-provider LLM abstraction layer
│   ├── paypal.ts          # Core PayPal REST API client (Orders, Payouts, Invoicing)
│   └── prisma.ts          # Singleton Prisma PostgreSQL client
├── prisma/
│   ├── schema.prisma      # Schema definition (Club, Movement, Tag, Claim, AuditLog)
│   └── seed.ts            # Enterprise seed data script
├── .env.example           # Sanitized environment template
└── README.md              # Project documentation & architectural specification
```

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for details.  
Built for the **PayPal AI Global Hackathon**.
