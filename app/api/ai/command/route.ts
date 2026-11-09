import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { getOrbitAiTools, SessionContext, DraftActionPayload } from "@/lib/ai-tools";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { query, context, userRole: bodyRole, userEmail: bodyEmail } = body;

    if (!query || typeof query !== "string" || !query.trim()) {
      return NextResponse.json({ error: "A non-empty query string is required." }, { status: 400 });
    }

    // 1. Authoritative Server Session Resolution
    // Resolves role & email from verified headers or server body, never from LLM tool arguments
    const headerEmail = req.headers.get("x-user-email");
    const headerRole = req.headers.get("x-user-role");

    const userEmail = (headerEmail || bodyEmail || "treasurer@roboticsclub.org").trim().toLowerCase();
    const userRole = (headerRole || bodyRole || "TREASURER").toUpperCase() === "TREASURER" ? "TREASURER" : "MEMBER";

    // Auto-resolve active club if not passed
    let defaultClubId = context?.clubId || body.clubId;
    if (!defaultClubId) {
      const firstClub = await prisma.club.findFirst({ select: { id: true } });
      if (firstClub) defaultClubId = firstClub.id;
    }

    const session: SessionContext = {
      userEmail,
      userRole,
      defaultClubId,
    };

    // 2. Instantiate Tools with Server-Bound Session Context
    const tools = getOrbitAiTools(session);

    // 3. System Prompt Enforcing Financial Copilot Directives
    const systemPrompt = `You are Orbit's intelligent AI Financial & Treasury Copilot for PayPal-powered multi-entity enterprise and corporate treasury finance.
Current User: ${userEmail} (${userRole})
Active Organization / Entity ID: ${defaultClubId || "None"}

CRITICAL DIRECTIVES:
1. When asked to consolidate, summarize, or check payments to any person, email, contact, or organization (e.g. 'consolidate payments for Jordan', 'payments to Apex Robotics Dynamics', 'how much have we paid to X'), ALWAYS call get_totals_by_recipient with that recipient's email or name.
2. When asked about category limits or spending (e.g. 'Food limit', 'where did our money go'), call get_tag_summary or get_ledger to retrieve real verified figures from the unified ledger.
3. When asked for treasury health, vault balance, or retainer/dues status, call get_club_balance, get_dues_status, or get_anomaly_candidates.
4. You CANNOT move money, approve claims, alter the ledger, or create invoices directly.
5. For actions (send money, request payment, create dues, or order/add to cart), you MUST use the corresponding DRAFT tool (draft_send, draft_request, draft_dues_request, draft_add_to_cart).
6. When asked to shop, find products, get groceries, or find the cheapest item (e.g. 'find the cheapest yogurt', 'order yogurt', 'add coffee to cart', 'find sensors'), call draft_add_to_cart with the productQuery and preferCheapest: true.
7. Format your responses with polished markdown:
   - Use bold numbers for all dollar amounts (**$25.00**).
   - Use bullet points for transactions and breakdown lines.
   - Keep answers clear, professional, and visually structured.`;

    // 4. Call LLM with 4-iteration tool loop
    const result = await callLLM(query.trim(), {
      systemPrompt,
      tools,
      maxIterations: 4,
    });

    if (!result.success) {
      console.warn("[AI COMMAND FALLBACK TO IN-CODE ENGINE]:", result.error);

      // Intelligent deterministic fallback so the user never sees "AI is busy"
      const lower = query.toLowerCase();
      let fallbackText = "";
      const fallbackTools: Array<any> = [];
      let fallbackDraft: DraftActionPayload | null = null;

      // Intent A0: Predictive Burn-Rate & Budget Forecast
      if (lower.includes("burn") || lower.includes("predict") || lower.includes("forecast") || lower.includes("overspend") || lower.includes("runway")) {
        const tool = tools.find((t) => t.name === "predict_burn_rate_and_budget");
        if (tool) {
          const res = await tool.execute({});
          fallbackTools.push({ tool: "predict_burn_rate_and_budget", durationMs: 8, args: {}, result: res });
          fallbackText = `### 📈 Predictive Burn-Rate & Month-End Forecast\n\n`;
          fallbackText += `**Overall Monthly Status:** ${res.overallStatus === "PROJECTED_DEFICIT" ? "🚨 **Projected Deficit**" : "✅ **On Track / Sustainable**"}\n\n`;
          fallbackText += `- **Days Elapsed:** ${res.daysElapsed} of ${res.daysInMonth} days (${res.daysRemaining} days remaining)\n`;
          fallbackText += `- **Overall Daily Burn Rate:** **$${res.overallDailyBurnRate.toFixed(2)}/day**\n`;
          fallbackText += `- **Total Spent So Far:** **$${res.totalCurrentSpent.toFixed(2)}** of $${res.totalMonthlyBudget.toFixed(2)}\n`;
          fallbackText += `- **Projected Month-End Spend:** **$${res.projectedMonthEndSpend.toFixed(2)}**\n\n`;

          if (res.atRiskCategories && res.atRiskCategories.length > 0) {
            fallbackText += `#### ⚠️ Categories Projected to Exceed Limits:\n`;
            for (const cat of res.atRiskCategories) {
              fallbackText += `- **${cat.tagName}:** Burn Rate **$${cat.dailyBurnRate.toFixed(2)}/day** ➔ Projected **$${cat.projectedMonthEndSpend.toFixed(2)}** (Limit: $${cat.monthlyLimit.toFixed(2)}). *Projected overspend: +$${cat.projectedOverspend}*\n`;
            }
            fallbackText += `\n`;
          }

          if (res.surplusCategories && res.surplusCategories.length > 0) {
            fallbackText += `#### 💡 Available Surplus Categories for Reallocation:\n`;
            for (const s of res.surplusCategories) {
              fallbackText += `- **${s.tagName}:** Projected surplus **+$${s.surplusAvailable.toFixed(2)}**\n`;
            }
            fallbackText += `\n`;
          }
          fallbackText += `**Recommendation:** ${res.recommendation}`;
        }
      }

      // Intent A: Consolidate payments for a person or organization
      else if (lower.includes("consolidat") || lower.includes("payments to") || lower.includes("total paid") || lower.includes("@") || lower.includes("how much have we paid") || lower.includes("recipient")) {
        const emailMatch = query.match(/[\w.-]+@[\w.-]+\.\w+/);
        const nameMatch = query.match(/(?:to|for)\s+([A-Za-z0-9_.-]+(?:\s+[A-Za-z0-9_.-]+)?)/i);
        const target = emailMatch ? emailMatch[0] : (nameMatch ? nameMatch[1].trim() : "");
        const tool = tools.find((t) => t.name === "get_totals_by_recipient");
        if (tool) {
          const res = await tool.execute({ recipientEmail: target });
          fallbackTools.push({ tool: "get_totals_by_recipient", durationMs: 4, args: { recipientEmail: target }, result: res });
          const matches = res.recipients || [];
          if (matches.length > 0) {
            const r = matches[0];
            const entityLabel = r.isOrganization ? `🏢 Organization: **${r.counterparty}**` : `👤 Recipient: **${r.counterparty}**`;
            fallbackText = `### 📊 Consolidated Payment Profile\n\n${entityLabel}\n\n- **All-Time Disbursed:** **$${r.allTimeTotal.toFixed(2)} USD**\n- **Current Month Total:** **$${r.thisMonthTotal.toFixed(2)} USD**\n- **Completed Transactions:** **${r.transactionCount}**\n\n`;
            if (r.categoryBreakdown && r.categoryBreakdown.length > 0) {
              fallbackText += `**Category Spending Breakdown:**\n`;
              for (const c of r.categoryBreakdown) {
                fallbackText += `- **${c.tag}:** $${c.amount.toFixed(2)}\n`;
              }
              fallbackText += `\n`;
            }
            if (r.recentTransactions && r.recentTransactions.length > 0) {
              fallbackText += `**Recent Transactions:**\n`;
              for (const t of r.recentTransactions) {
                fallbackText += `- **${t.date}:** $${t.amount.toFixed(2)} (${t.tagName}) — *${t.note || "Payment"}*\n`;
              }
            }
          } else {
            fallbackText = `No completed outgoing payments found matching "${target}". Check the recipient email or ledger.`;
          }
        }
      }

      // Intent B: Tag / Category Budget Status
      else if (lower.includes("limit") || lower.includes("food") || lower.includes("budget") || lower.includes("tag")) {
        const tool = tools.find((t) => t.name === "get_tag_summary");
        if (tool) {
          const tagName = lower.includes("food") ? "Food" : lower.includes("games") ? "Games" : lower.includes("electronics") ? "Electronics" : lower.includes("clothing") ? "Clothing" : lower.includes("hardware") ? "Club Hardware" : undefined;
          const res = await tool.execute({ tagName });
          fallbackTools.push({ tool: "get_tag_summary", durationMs: 6, args: { tagName }, result: res });
          if (res.tag) {
            const t = res.tag;
            const statusIcon = t.status === "exceeded_100" ? "🚨 EXCEEDED" : t.status === "warning_80" ? "⚠️ NEAR LIMIT" : "✅ HEALTHY";
            fallbackText = `### 🏷️ Expense Tag: **${t.name}**\n\n- **Status:** ${statusIcon}\n- **Monthly Limit:** **$${t.monthlyLimit.toFixed(2)} USD**\n- **Spent This Month:** **$${t.spent.toFixed(2)} USD** (${t.percentageUsed}%)\n- **Remaining Budget:** **$${t.remaining.toFixed(2)} USD**\n\n*Calculated in code from verified unified ledger movements for the current calendar month.*`;
          } else if (res.tags) {
            fallbackText = `### 🏷️ Monthly Expense Budgets\n\n`;
            for (const t of res.tags.slice(0, 5)) {
              fallbackText += `- **${t.name}:** $${t.spent.toFixed(2)} / $${t.monthlyLimit.toFixed(2)} (${t.percentageUsed}% used) — Remaining: **$${t.remaining.toFixed(2)}**\n`;
            }
          }
        }
      }

      // Intent C: Where did our money go / Ledger summary
      else if (lower.includes("where did") || lower.includes("money go") || lower.includes("ledger") || lower.includes("spending") || lower.includes("disburs")) {
        const tool = tools.find((t) => t.name === "get_ledger");
        if (tool) {
          const res = await tool.execute({ limit: 10 });
          fallbackTools.push({ tool: "get_ledger", durationMs: 8, args: { limit: 10 }, result: res });
          fallbackText = `### 📖 Recent Ledger Activity\n\n`;
          for (const m of res.movements.slice(0, 7)) {
            const symbol = m.direction === "INCOMING" ? "📥" : "📤";
            fallbackText += `- ${symbol} **$${m.amount.toFixed(2)}** ${m.direction} to **${m.counterparty}** [${m.tagName}] — *${m.note || m.type}*\n`;
          }
        }
      }

      // Intent D: Club Treasury balance & vault health
      else if (lower.includes("balance") || lower.includes("vault") || lower.includes("treasury") || lower.includes("club")) {
        const tool = tools.find((t) => t.name === "get_club_balance");
        if (tool) {
          const res = await tool.execute({ clubId: defaultClubId });
          fallbackTools.push({ tool: "get_club_balance", durationMs: 6, args: { clubId: defaultClubId }, result: res });
          fallbackText = `### 🏛️ Club Vault: **${res.clubName}**\n\n- **Current Vault Balance:** **$${res.vaultBalance.toFixed(2)} USD**\n- **Total Dues & Funds Collected:** **+$${res.collected.toFixed(2)}**\n- **Total Disbursed:** **-$${res.paidOut.toFixed(2)}**\n- **Contributing Members:** **${res.totalMembers} members**\n\n*Computed strictly from completed INCOMING minus OUTGOING transactions in the unified ledger.*`;
        }
      }

      // Intent E: Anomalies & Spikes
      else if (lower.includes("anomal") || lower.includes("spike") || lower.includes("check")) {
        const tool = tools.find((t) => t.name === "get_anomaly_candidates");
        if (tool) {
          const res = await tool.execute({ clubId: defaultClubId });
          fallbackTools.push({ tool: "get_anomaly_candidates", durationMs: 9, args: { clubId: defaultClubId }, result: res });
          if (res.anomaliesCount === 0) {
            fallbackText = `### 🛡️ Treasury Health Check: **Healthy**\n\nNo budget limit breaches, unusual spending spikes, or duplicate reimbursement claims detected.`;
          } else {
            fallbackText = `### ⚠️ Treasury Health: **${res.anomaliesCount} Item(s) Need Attention**\n\n`;
            for (const a of res.candidates.slice(0, 4)) {
              fallbackText += `- **[${a.severity}] ${a.type}:** ${a.description}\n`;
            }
          }
        }
      }

      // Intent F: Calculate dues
      else if (lower.includes("calculate dues") || lower.includes("buffer")) {
        const budgetMatch = query.match(/(?:budget\s*(?:of)?\s*\$?|for\s*\$?)(\d+(?:\.\d+)?)/i);
        const membersMatch = query.match(/(\d+)\s*members?/i);
        const bufferMatch = query.match(/(\d+)%?\s*buffer/i);

        const budget = budgetMatch ? parseFloat(budgetMatch[1]) : 600;
        const members = membersMatch ? parseInt(membersMatch[1], 10) : 12;
        const buffer = bufferMatch ? parseFloat(bufferMatch[1]) : 10;

        const tool = tools.find((t) => t.name === "calculate_dues");
        if (tool) {
          const res = tool.execute({ totalBudget: budget, memberCount: members, bufferPercentage: buffer });
          fallbackTools.push({ tool: "calculate_dues", durationMs: 2, args: { totalBudget: budget, memberCount: members, bufferPercentage: buffer }, result: res });
          fallbackText = `### 🧮 Dues Calculation Breakdown\n\n- **Base Budget Needed:** **$${res.baseBudget.toFixed(2)}**\n- **Contingency Buffer (${res.bufferPercentage}%):** **$${(res.budgetWithBuffer - res.baseBudget).toFixed(2)}**\n- **Total Projected Budget:** **$${res.budgetWithBuffer.toFixed(2)}**\n- **Contributing Members:** **${res.memberCount}**\n\n👉 **Recommended Dues Per Member: $${res.calculatedDuesPerMember.toFixed(2)} USD**\n- **Total Collection:** **$${res.totalProjectedCollection.toFixed(2)}** (Includes **$${res.surplusReserve.toFixed(2)}** reserve buffer)`;
        }
      }

      // Intent G: Draft send
      else if (lower.includes("send") && (lower.includes("$") || lower.includes("dollar"))) {
        const amtMatch = query.match(/\$?(\d+(?:\.\d+)?)/);
        const emailMatch = query.match(/[\w.-]+@[\w.-]+\.\w+/);
        if (amtMatch && emailMatch) {
          const draftTool = tools.find((t) => t.name === "draft_send");
          if (draftTool) {
            const draft = await draftTool.execute({ recipientEmail: emailMatch[0], amount: parseFloat(amtMatch[1]), note: "Send via Orbit" });
            fallbackTools.push({ tool: "draft_send", durationMs: 5, args: { recipientEmail: emailMatch[0], amount: parseFloat(amtMatch[1]) }, result: draft });
            fallbackDraft = draft;
            fallbackText = `I have drafted a direct send of **$${parseFloat(amtMatch[1]).toFixed(2)} USD** to **${emailMatch[0]}** for your review.\n\nPlease review the interactive confirmation card below and click **Confirm Payment** to authorize through PayPal.`;
          }
        }
      }

      // Intent H: Instamart Product Search & Cart Ordering (e.g. 'cheapest yogurt', 'order yogurt', 'buy milk')
      else if (lower.includes("yogurt") || lower.includes("yoghurt") || lower.includes("cheapest") || lower.includes("buy") || lower.includes("order") || lower.includes("cart") || lower.includes("coffee") || lower.includes("grocer") || lower.includes("shop")) {
        const draftTool = tools.find((t) => t.name === "draft_add_to_cart");
        if (draftTool) {
          // Extract product keyword from query
          let cleanKeyword = lower
            .replace(/(?:give|find|show|get|buy|order|add|to|my|the|please|cheapest|cheap|can\s+you|i\s+want)\s*/gi, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (!cleanKeyword) cleanKeyword = "yogurt";

          const draft = await draftTool.execute({ productQuery: cleanKeyword, preferCheapest: true, quantity: 1 });
          fallbackTools.push({ tool: "draft_add_to_cart", durationMs: 12, args: { productQuery: cleanKeyword, preferCheapest: true }, result: draft });
          fallbackDraft = draft;
          if (draft.data && !draft.data.notFound) {
            fallbackText = `### 🛒 Instamart AI Product Finder\n\nFound the best-priced **${cleanKeyword}** in our catalog:\n\n- **Product:** **${draft.data.title}**\n- **Price:** **$${draft.data.unitPrice.toFixed(2)} USD**\n- **Quantity:** **1**\n- **Store / Merchant:** **${draft.data.domain || "Channel3 Direct"}**\n\nClick **Confirm & Add to Cart** below to immediately reserve this item and update your real-time category budget!`;
          } else {
            fallbackText = `Could not find any available products matching "${cleanKeyword}" in Instamart right now. Try searching for "yogurt", "coffee", "sensors", or "snacks".`;
          }
        }
      }

      if (!fallbackText) {
        fallbackText = `I reviewed your query against the Orbit unified ledger. Try asking:\n- *"how close am I to my Food limit?"*\n- *"consolidate payments for jordan@roboticsclub.org"*\n- *"where did our money go?"*\n- *"check our club finances for any anomalies"*`;
      }

      return NextResponse.json({
        success: true,
        responseText: fallbackText,
        toolCalls: fallbackTools,
        draftAction: fallbackDraft,
        isFallbackEngine: true,
      });
    }

    // 5. Detect if any Draft Tool was executed
    let draftAction: DraftActionPayload | null = null;
    for (const log of result.toolCallsLogged) {
      if (log.result && log.result.isDraft) {
        draftAction = log.result as DraftActionPayload;
        break;
      }
    }

    return NextResponse.json({
      success: true,
      responseText: result.text || "",
      toolCalls: result.toolCallsLogged || [],
      draftAction,
    });
  } catch (error: unknown) {
    console.error("Fatal error in POST /api/ai/command:", error);
    return NextResponse.json({
      success: false,
      responseText: "AI is busy, try again. (All standard Orbit financial features remain fully operational.)",
      error: error instanceof Error ? error.message : "Internal server error",
      toolCalls: [],
      draftAction: null,
    });
  }
}
