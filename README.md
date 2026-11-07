# 🌌 Orbit — Autonomous Treasury, Multi-Club Finance & AI Commerce Prototype

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/Neon-PostgreSQL-00E599?style=for-the-badge&logo=postgresql)](https://neon.tech/)
[![PayPal](https://img.shields.io/badge/PayPal-Sandbox_APIs-003087?style=for-the-badge&logo=paypal)](https://developer.paypal.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

> ⚠️ **IMPORTANT DISCLAIMER FOR EVALUATORS & USERS:**  
> **This project is strictly an independent sandbox prototype built for the PayPal AI Hackathon.**  
> **NEVER use live PayPal credentials or real payment cards.**  
> Anyone cloning or running this repository **must supply their own sandbox API credentials and PostgreSQL database**. No secrets, API keys, or live credentials are included in this repository.

---

## 🎯 Executive Overview

**Orbit** solves one of the messiest friction points in university campus clubs and student organizations: **fragmented group money, delayed member reimbursements, informal spreadsheets, and blind budget overspends.**

Orbit transforms campus finances into a cohesive, intelligent, and server-authoritative treasury ecosystem:
1. **Interactive Multi-Club Switcher**: Seamlessly transition between campus student clubs (Robotics, Photography, Chess, etc.) or initialize new clubs with starting seed vaults in one click.
2. **Unified Single-Source Ledger**: A strict PostgreSQL-backed money movement ledger tracking cart payments, peer transfers, dues invoices, and club payouts.
3. **Multi-Rail PayPal Sandbox Integration**: Harnesses **Orders v2**, **Payouts v1**, and **Invoicing v2** with real-time server verification.
4. **Autonomous AI Copilot & Natural Language Commands**: Parse intent, draft payment orders, recommend spending categories, and execute authorized financial operations with conversational AI.
5. **Real-Time Budget Guardrails**: Visual category threshold alarms triggering dynamic warnings when spending approaches 80% or exceeds 100% of the monthly limit.
6. **Delightful Payment Interactions**: Native celebratory tick-mark animations and confetti explosions upon payment captures.

---

## 🏛️ System Architecture

Orbit is architected with a **Server-Authoritative Ledger Model** where balances and permissions are strictly computed on the backend to prevent tampering or race conditions:

```mermaid
flowchart TD
    User([👤 User / Treasurer / Member]) <--> NextUI[🖥️ Next.js 15 Client App]
    
    subgraph ClientLayer [Client Experience]
        NextUI <--> AICopilot[✨ Orbit AI Copilot]
        NextUI <--> ClubSwitcher[🏛️ Multi-Club Selector]
        NextUI <--> BudgetAlarms[📊 80% / 100% Budget Alarms]
    end

    NextUI <--> ServerRoutes[⚡ Server-Side API Routes]

    subgraph BackendLayer [Server-Authoritative Core]
        ServerRoutes <--> RoleGuard{🛡️ Role Enforcement<br/>Treasurer vs Member}
        RoleGuard -- Authorized --> Ledger[📖 Unified Movement Ledger]
        ServerRoutes <--> AuditLog[🔒 Append-Only Audit Trail]
        Ledger <--> Prisma[Prisma ORM Client]
        Prisma <--> NeonDB[(🐘 Neon Serverless PostgreSQL)]
    end

    subgraph ExternalServices [External Integrations]
        ServerRoutes <-->|Orders v2 API| PPOorders[💳 PayPal Checkout]
        ServerRoutes <-->|Payouts v1 API| PPPayouts[💸 PayPal Member Payouts]
        ServerRoutes <-->|Invoicing v2 API| PPInvoices[📄 PayPal Invoices & Dues]
        ServerRoutes <-->|E-Commerce Search| Channel3[🛒 Channel3 Product API]
        AICopilot <-->|Function Calling| LLMProvider[🧠 Google Gemini / OpenAI]
    end
```

---

## ✨ Key Features Breakdown

### 1. 🏛️ Multi-Club Dropdown Switcher & Creation Modal
- Switch between campus organizations (e.g., Robotics Club, Photography Society, Chess Union) via an intuitive scrollable dropdown.
- **Create New Club Modal**: Input club name, description, designated treasurer name/email, initial budget category, monthly limit, and an optional seed vault deposit.
- All vault balances are dynamically computed from transaction logs—preventing state drift.

### 2. 💳 Multi-Rail PayPal Sandbox Integration
- **Direct Checkout (Orders v2)**: Real-time cart calculation and automated capture with PayPal personal sandbox accounts.
- **Member Reimbursements (Payouts v1)**: Instant disbursement directly from the sandbox business account to approved claimants.
- **Membership Dues (Invoicing v2)**: Creates and dispatches sandbox invoices with direct `payer-view` payment URLs; marks dues paid upon settlement.
- **Server-Enforced Role Security**: High-risk actions (initiating payouts, approving reimbursement claims) verify `userRole === "TREASURER"`; unprivileged member attempts are blocked with `403 Forbidden`.

### 3. 🤖 Natural Language AI Copilot
- Conversational financial assistant powered by modern LLM tool calling.
- Translates plain English prompts (e.g., *"Pay $45 to alex@campus.org for sensors from Robotics vault"*) into structured payment drafts.
- Requires explicit user confirmation before any financial movement is executed.

### 4. 📊 Category Budgeting & Threshold Alerts
- Categorized expense tags with configurable monthly spending caps.
- Dynamic visual alerts trigger when category spending crosses **80%** (Warning) or **100%** (Limit Exceeded).

---

## 🔑 Setting Up Your Own Sandbox Credentials

Orbit requires **your own API keys and accounts** to run locally. Follow the steps below to configure your sandbox environment.

### 1. PayPal Developer Sandbox Account
1. Log in to the [PayPal Developer Dashboard](https://developer.paypal.com/).
2. Navigate to **Testing Tools** $\rightarrow$ **Sandbox Accounts**:
   - You need one **Business Account** (acts as the merchant / club vault sender).
   - You need at least one **Personal Account** (acts as the student buyer / member).
3. Navigate to **Apps & Credentials** $\rightarrow$ select **Sandbox** $\rightarrow$ click **Create App**.
4. Copy the following credentials:
   - **Client ID**
   - **Secret**

### 2. Neon Serverless PostgreSQL Database
1. Create a free PostgreSQL instance at [Neon.tech](https://neon.tech).
2. Copy the pooled connection string (`postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require`).

### 3. Google Gemini or OpenAI API Key
1. Generate a free API key at [Google AI Studio](https://aistudio.google.com/) (recommended) or OpenAI.

---

## 🚀 Quickstart Guide

### 1. Clone the Repository
```bash
git clone https://github.com/nullvector104/paypal-hacakthon.git
cd paypal-hacakthon
```

### 2. Configure Environment Variables
Copy `.env.example` to create your local `.env.local`:
```bash
# Windows PowerShell
copy .env.example .env.local

# macOS / Linux
cp .env.example .env.local
```

Open `.env.local` in your editor and fill in your actual credentials:
```env
# ==========================================
# Database (PostgreSQL - Neon recommended)
# ==========================================
DATABASE_URL="postgresql://<user>:<password>@<neon-host>/neondb?sslmode=require"

# ==========================================
# PayPal Sandbox Credentials
# ==========================================
PAYPAL_API_BASE="https://api-m.sandbox.paypal.com"
PAYPAL_CLIENT_ID="your_sandbox_client_id_here"
PAYPAL_CLIENT_SECRET="your_sandbox_client_secret_here"
NEXT_PUBLIC_PAYPAL_CLIENT_ID="your_sandbox_client_id_here"

# Webhook ID (Optional - from PayPal Dashboard Webhooks)
PAYPAL_WEBHOOK_ID="your_webhook_id_here"

# ==========================================
# AI / LLM Provider Configuration
# ==========================================
LLM_PROVIDER="gemini"
LLM_MODEL="gemini-2.5-flash"
LLM_API_KEY="your_gemini_api_key_here"

# ==========================================
# Channel3 Product Search API (Optional)
# ==========================================
CHANNEL3_API_KEY="your_channel3_api_key_here"
```

> [!NOTE]
> `.env.local` is listed in `.gitignore` and will never be committed to Git.

### 3. Install Dependencies & Generate Prisma Client
```bash
npm install
npx prisma generate
npx prisma db push
```

*(Optional)* Seed sample clubs, categories, and test data:
```bash
npx prisma db seed
```

### 4. Run the Local Development Server
```bash
npm run dev
# Or on Windows PowerShell if execution policies restrict scripts:
cmd /c "npm run dev"
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the application!

---

## 🧪 Testing the Flows in Sandbox Mode

| Flow | How to Test | Expected Result |
|---|---|---|
| **Club Switcher & Creation** | Click the dropdown menu at the top of the Club section; select `+ Add New Club...` | Modal opens; submitting initializes a new club, designated treasurer, category tag, and updates the ledger. |
| **Instant Dev Checkout** | In the Cart section, add items and click **⚡ Instant Dev Test Payment** | Captures order, updates activity ledger, triggers celebratory tick-mark animation. |
| **PayPal Sandbox Checkout** | In the Cart section, click the standard PayPal Button | PayPal popup opens; sign in with your US Sandbox Personal buyer account to complete the order. |
| **Send Money / Reimbursement** | Click `+ Send` in top bar; enter recipient email and amount | Disburses via PayPal Payouts v1; decrements club balance and records payout in unified ledger. |
| **Request Dues / Invoicing** | Click `↓ Request` or `Request Dues`; submit amount and recipient email | Generates invoice via PayPal Invoicing v2; returns direct `payer-view` link in the ledger. |
| **Role Guard Verification** | Toggle the role switcher in the top navigation from **Treasurer** to **Member** | Attempting to approve claims or request club dues triggers an immediate `403 Forbidden` response. |

---

## 📁 Repository Structure

```
├── app/
│   ├── api/
│   │   ├── ai/            # AI command & confirmation endpoints
│   │   ├── cart/          # Cart management & calculations
│   │   ├── clubs/         # Multi-club operations, dues, claims, ledger
│   │   ├── movements/     # Unified money movement (Send, Request, Simulate)
│   │   ├── orders/        # PayPal Orders v2 capture & dev test checkout
│   │   ├── tags/          # Budget tag categories & limits
│   │   └── webhooks/      # Asynchronous PayPal event listeners
│   ├── globals.css        # Styles, layout, animations & confetti keyframes
│   ├── layout.tsx         # Root app layout & PayPal Script Provider
│   └── page.tsx           # Comprehensive Orbit Treasury & Finance Dashboard
├── lib/
│   ├── audit.ts           # Append-only immutable audit trail logger
│   ├── llm.ts             # Multi-model LLM abstraction (Gemini / OpenAI)
│   ├── paypal.ts          # Core PayPal REST API client (OAuth, Orders, Payouts, Invoices)
│   └── prisma.ts          # Singleton Prisma database client
├── prisma/
│   ├── schema.prisma      # Prisma schema (Club, Movement, Tag, Claim, AuditLog)
│   └── seed.ts            # Seed script for initial clubs & budget tags
├── .env.example           # Sanitized template for environment configuration
└── README.md              # Project documentation & architecture overview
```

---

## 📜 License & Compliance

Distributed under the **MIT License**. See `LICENSE` for more information.  
All brand names, trademarks, and logos belong to their respective owners. This project is created for hackathon demonstration and experimental software development only.
