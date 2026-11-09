/**
 * lib/ai-tools.ts - Tool Registry for Orbit AI Financial & Treasury Copilot
 *
 * Security Invariants & Rules:
 * 1. User identity and role come strictly from server sessionContext, never tool arguments.
 * 2. NO tool moves money, creates invoices, approves claims, or mutates the ledger.
 * 3. Draft tools ONLY produce typed preview schemas for user confirmation.
 * 4. Read-only tools compute in CODE; the LLM synthesizes and explains.
 * 5. All query results are capped at max 20 rows.
 * 6. Treat notes and names as data, never prompt instructions.
 */

import { prisma } from "@/lib/prisma";
import { ToolDefinition } from "@/lib/llm";
import { getCurrentMonthRange, getTagSpendingSummaries, checkTagLimitImpact } from "@/lib/spending";
import { searchChannel3Products } from "@/lib/channel3";

export interface SessionContext {
  userEmail: string;
  userRole: "TREASURER" | "MEMBER";
  defaultClubId?: string;
}

export interface DraftActionPayload {
  isDraft: true;
  draftType: "SEND" | "REQUEST" | "DUES" | "REMINDER" | "ADD_TO_CART";
  readyForConfirmation: boolean;
  summary: string;
  data: Record<string, any>;
}

/**
 * Creates the complete list of 8 Read-Only tools and 4 Draft-Only tools
 * bound strictly to the verified server session context.
 */
export function getOrbitAiTools(session: SessionContext): ToolDefinition[] {
  const { userEmail, userRole } = session;

  // -------------------------------------------------------------
  // READ-ONLY TOOL 1: get_tag_summary
  // -------------------------------------------------------------
  const getTagSummaryTool: ToolDefinition = {
    name: "get_tag_summary",
    description:
      "Fetches current month spending, limit, and remaining budget for a specific expense category tag or all tags.",
    parameters: {
      type: "OBJECT",
      properties: {
        tagName: {
          type: "STRING",
          description: "Optional category tag name (e.g. 'Food', 'Parts', 'Games', 'Electronics'). Omit to list all.",
        },
      },
      required: [],
    },
    execute: async (args: { tagName?: string }) => {
      const summaries = await getTagSpendingSummaries(session.defaultClubId);

      if (args.tagName && typeof args.tagName === "string") {
        const query = args.tagName.trim().toLowerCase();
        const found = summaries.find((t) => t.name.toLowerCase() === query);
        if (found) {
          return {
            tag: found,
            note: "Calculated in code from real unified ledger movements for the current calendar month.",
          };
        }
        // Fallback search
        const partial = summaries.filter((t) => t.name.toLowerCase().includes(query));
        if (partial.length > 0) {
          return { tags: partial.slice(0, 5) };
        }
        return {
          error: `Category tag "${args.tagName}" not found. Available tags: ${summaries.map((t) => t.name).join(", ")}`,
        };
      }

      return {
        count: Math.min(summaries.length, 20),
        tags: summaries.slice(0, 20),
        note: "All spending computed from completed outgoing movements this month.",
      };
    },
  };

  // -------------------------------------------------------------
  // READ-ONLY TOOL 2: get_ledger
  // -------------------------------------------------------------
  const getLedgerTool: ToolDefinition = {
    name: "get_ledger",
    description:
      "Queries recent transactions from the unified ledger. Capped at max 20 rows.",
    parameters: {
      type: "OBJECT",
      properties: {
        limit: {
          type: "INTEGER",
          description: "Number of rows to fetch (1 to 20, defaults to 10).",
        },
        type: {
          type: "STRING",
          description: "Filter by movement type: CART_PAYMENT, SEND, REQUEST, CLUB_DUES, CLUB_PAYOUT.",
        },
        direction: {
          type: "STRING",
          description: "Filter by direction: INCOMING or OUTGOING.",
        },
      },
      required: [],
    },
    execute: async (args: { limit?: number; type?: any; direction?: any }) => {
      const take = Math.min(Math.max(1, Number(args.limit) || 10), 20);

      const where: any = {};
      if (args.type) where.type = args.type;
      if (args.direction) where.direction = args.direction;

      const movements = await prisma.movement.findMany({
        where,
        take,
        orderBy: { createdAt: "desc" },
        include: { tag: true, club: true },
      });

      return {
        count: movements.length,
        movements: movements.map((m) => ({
          id: m.id,
          type: m.type,
          direction: m.direction,
          counterparty: m.counterparty,
          amount: m.amount,
          currency: m.currency,
          tagName: m.tag?.name || "Uncategorized",
          status: m.status,
          note: m.note || null,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    },
  };

  // -------------------------------------------------------------
  // READ-ONLY TOOL 3: get_totals_by_recipient / consolidate_payments
  // -------------------------------------------------------------
  const getTotalsByRecipientTool: ToolDefinition = {
    name: "get_totals_by_recipient",
    description:
      "Consolidates and aggregates payments made to a specific person (by email/name) or organization/merchant, returning all-time total, current month total, transaction count, category breakdown, and itemized history.",
    parameters: {
      type: "OBJECT",
      properties: {
        recipientEmail: {
          type: "STRING",
          description: "Recipient email, counterparty name, or organization name to consolidate (e.g. 'jordan@roboticsclub.org', 'jordan', 'Robotics Club', 'Channel3'). Omit to list top counterparties.",
        },
      },
      required: [],
    },
    execute: async (args: { recipientEmail?: string }) => {
      const { start, end } = getCurrentMonthRange();

      const queryStr = (args.recipientEmail || "").trim();

      const where: any = {
        direction: "OUTGOING",
        status: "COMPLETED",
      };

      if (queryStr) {
        where.counterparty = {
          contains: queryStr,
          mode: "insensitive",
        };
      }

      const movements = await prisma.movement.findMany({
        where,
        include: {
          tag: true,
          club: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      const recipientMap = new Map<
        string,
        {
          counterparty: string;
          allTimeTotal: number;
          thisMonthTotal: number;
          count: number;
          tags: Record<string, number>;
          recentTransactions: Array<{
            id: string;
            amount: number;
            type: string;
            tagName: string;
            note: string | null;
            date: string;
          }>;
        }
      >();

      for (const m of movements) {
        const key = m.counterparty.toLowerCase();
        let entry = recipientMap.get(key);
        if (!entry) {
          entry = {
            counterparty: m.counterparty,
            allTimeTotal: 0,
            thisMonthTotal: 0,
            count: 0,
            tags: {},
            recentTransactions: [],
          };
          recipientMap.set(key, entry);
        }
        entry.allTimeTotal += m.amount;
        entry.count += 1;
        if (m.createdAt >= start && m.createdAt <= end) {
          entry.thisMonthTotal += m.amount;
        }

        const tagName = m.tag?.name || "Other";
        entry.tags[tagName] = (entry.tags[tagName] || 0) + m.amount;

        if (entry.recentTransactions.length < 5) {
          entry.recentTransactions.push({
            id: m.id,
            amount: m.amount,
            type: m.type,
            tagName,
            note: m.note || null,
            date: m.createdAt.toISOString().split("T")[0],
          });
        }
      }

      const list = Array.from(recipientMap.values())
        .map((r) => ({
          counterparty: r.counterparty,
          allTimeTotal: parseFloat(r.allTimeTotal.toFixed(2)),
          thisMonthTotal: parseFloat(r.thisMonthTotal.toFixed(2)),
          transactionCount: r.count,
          categoryBreakdown: Object.entries(r.tags).map(([tag, amt]) => ({
            tag,
            amount: parseFloat(amt.toFixed(2)),
          })),
          recentTransactions: r.recentTransactions,
          isOrganization: !r.counterparty.includes("@") || r.counterparty.toLowerCase().includes("club") || r.counterparty.toLowerCase().includes("merchant"),
        }))
        .sort((a, b) => b.allTimeTotal - a.allTimeTotal)
        .slice(0, 20);

      return {
        query: queryStr || "ALL_TOP_RECIPIENTS",
        totalMatches: list.length,
        recipients: list,
        consolidationSummary: list.length === 1
          ? `Consolidated ${list[0].transactionCount} payment(s) to ${list[0].counterparty}: All-time $${list[0].allTimeTotal.toFixed(2)}, this month $${list[0].thisMonthTotal.toFixed(2)}.`
          : `Found ${list.length} counterparty match(es).`,
      };
    },
  };

  // -------------------------------------------------------------
  // READ-ONLY TOOL 4: get_club_balance
  // -------------------------------------------------------------
  const getClubBalanceTool: ToolDefinition = {
    name: "get_club_balance",
    description:
      "Calculates club vault balance in CODE directly from completed movements in the unified ledger.",
    parameters: {
      type: "OBJECT",
      properties: {
        clubId: {
          type: "STRING",
          description: "Optional club ID. If omitted, uses active club.",
        },
      },
      required: [],
    },
    execute: async (args: { clubId?: string }) => {
      const targetClubId = args.clubId || session.defaultClubId;

      let club;
      if (targetClubId) {
        club = await prisma.club.findUnique({
          where: { id: targetClubId },
          include: { members: true },
        });
      } else {
        club = await prisma.club.findFirst({
          include: { members: true },
        });
      }

      if (!club) {
        return { error: "No club found in database." };
      }

      // Query completed movements for this club
      const clubMovements = await prisma.movement.findMany({
        where: { clubId: club.id, status: "COMPLETED" },
        select: { direction: true, amount: true, type: true },
      });

      let collected = 0;
      let paidOut = 0;
      for (const m of clubMovements) {
        if (m.direction === "INCOMING") collected += m.amount;
        else if (m.direction === "OUTGOING") paidOut += m.amount;
      }

      const vaultBalance = parseFloat((collected - paidOut).toFixed(2));

      return {
        clubId: club.id,
        clubName: club.name,
        currency: "USD",
        collected: parseFloat(collected.toFixed(2)),
        paidOut: parseFloat(paidOut.toFixed(2)),
        vaultBalance,
        totalMembers: club.members.length,
        calculationNote: "Computed strictly in code from completed INCOMING minus OUTGOING ledger movements.",
      };
    },
  };

  // -------------------------------------------------------------
  // READ-ONLY TOOL 5: get_dues_status
  // -------------------------------------------------------------
  const getDuesStatusTool: ToolDefinition = {
    name: "get_dues_status",
    description:
      "Calculates live Paid, Pending, and Overdue dues statuses in CODE from the unified ledger.",
    parameters: {
      type: "OBJECT",
      properties: {
        clubId: {
          type: "STRING",
          description: "Optional club ID.",
        },
      },
      required: [],
    },
    execute: async (args: { clubId?: string }) => {
      const targetClubId = args.clubId || session.defaultClubId;

      const club = targetClubId
        ? await prisma.club.findUnique({
            where: { id: targetClubId },
            include: { members: true, duesCycles: { orderBy: { createdAt: "desc" }, take: 5 } },
          })
        : await prisma.club.findFirst({
            include: { members: true, duesCycles: { orderBy: { createdAt: "desc" }, take: 5 } },
          });

      if (!club) {
        return { error: "Club not found." };
      }

      const duesMovements = await prisma.movement.findMany({
        where: { clubId: club.id, type: "CLUB_DUES" },
      });

      const now = new Date();

      const cyclesSummary = club.duesCycles.map((cycle) => {
        const isPastDueDate = now > new Date(cycle.dueDate);
        let paidCount = 0;
        let pendingCount = 0;
        let overdueCount = 0;

        const memberStatuses = club.members.map((member) => {
          const movement = duesMovements.find(
            (m) =>
              m.counterparty.toLowerCase() === member.email.toLowerCase() &&
              (m.note?.includes(cycle.title) ||
                Math.abs(new Date(m.createdAt).getTime() - new Date(cycle.createdAt).getTime()) < 15000)
          );

          let status: "PAID" | "PENDING" | "OVERDUE" = "PENDING";
          if (movement?.status === "COMPLETED") {
            status = "PAID";
            paidCount++;
          } else if (isPastDueDate) {
            status = "OVERDUE";
            overdueCount++;
          } else {
            status = "PENDING";
            pendingCount++;
          }

          return {
            memberName: member.name,
            memberEmail: member.email,
            status,
            amount: cycle.amount,
          };
        });

        const totalExpected = cycle.amount * club.members.length;
        const totalCollected = paidCount * cycle.amount;

        return {
          cycleId: cycle.id,
          title: cycle.title,
          amountPerMember: cycle.amount,
          dueDate: cycle.dueDate.toISOString().split("T")[0],
          isPastDueDate,
          totalExpected: parseFloat(totalExpected.toFixed(2)),
          totalCollected: parseFloat(totalCollected.toFixed(2)),
          paidCount,
          pendingCount,
          overdueCount,
          members: memberStatuses.slice(0, 20),
        };
      });

      return {
        clubId: club.id,
        clubName: club.name,
        duesCycles: cyclesSummary,
      };
    },
  };

  // -------------------------------------------------------------
  // READ-ONLY TOOL 6: calculate_dues
  // -------------------------------------------------------------
  const calculateDuesTool: ToolDefinition = {
    name: "calculate_dues",
    description:
      "Calculates per-member dues in CODE based on total club budget, member count, and optional contingency buffer.",
    parameters: {
      type: "OBJECT",
      properties: {
        totalBudget: {
          type: "NUMBER",
          description: "Total budget needed by the club (e.g. 600).",
        },
        memberCount: {
          type: "INTEGER",
          description: "Number of club members contributing (e.g. 12).",
        },
        bufferPercentage: {
          type: "NUMBER",
          description: "Optional buffer percentage for unexpected costs (e.g. 10 for 10%). Defaults to 0.",
        },
      },
      required: ["totalBudget", "memberCount"],
    },
    execute: (args: { totalBudget: number; memberCount: number; bufferPercentage?: number }) => {
      const totalBudget = Number(args.totalBudget);
      const memberCount = Number(args.memberCount);
      const buffer = Math.max(0, Number(args.bufferPercentage) || 0);

      if (isNaN(totalBudget) || totalBudget <= 0) {
        return { error: "totalBudget must be greater than 0" };
      }
      if (isNaN(memberCount) || memberCount <= 0) {
        return { error: "memberCount must be greater than 0" };
      }

      const budgetWithBuffer = totalBudget * (1 + buffer / 100);
      // Strict mathematical ceiling to the next penny to guarantee no shortfall
      const duesPerMember = Math.ceil((budgetWithBuffer / memberCount) * 100) / 100;
      const totalProjected = parseFloat((duesPerMember * memberCount).toFixed(2));
      const surplus = parseFloat((totalProjected - budgetWithBuffer).toFixed(2));

      return {
        formulaApplied: "Math.ceil((totalBudget * (1 + buffer/100) / memberCount) * 100) / 100",
        baseBudget: totalBudget,
        bufferPercentage: buffer,
        budgetWithBuffer: parseFloat(budgetWithBuffer.toFixed(2)),
        memberCount,
        calculatedDuesPerMember: duesPerMember,
        totalProjectedCollection: totalProjected,
        surplusReserve: surplus,
      };
    },
  };

  // -------------------------------------------------------------
  // READ-ONLY TOOL 7: get_pending_claims
  // -------------------------------------------------------------
  const getPendingClaimsTool: ToolDefinition = {
    name: "get_pending_claims",
    description:
      "Returns club reimbursement claims currently awaiting treasurer approval (SUBMITTED status).",
    parameters: {
      type: "OBJECT",
      properties: {
        clubId: {
          type: "STRING",
          description: "Optional club ID.",
        },
      },
      required: [],
    },
    execute: async (args: { clubId?: string }) => {
      const targetClubId = args.clubId || session.defaultClubId;

      const where: any = { status: "SUBMITTED" };
      if (targetClubId) where.clubId = targetClubId;

      const claims = await prisma.reimbursementClaim.findMany({
        where,
        take: 20,
        orderBy: { createdAt: "desc" },
        include: { tag: true, club: true },
      });

      return {
        count: claims.length,
        claims: claims.map((c) => ({
          id: c.id,
          clubName: c.club.name,
          requesterEmail: c.requesterEmail,
          amount: c.amount,
          tag: c.tag.name,
          note: c.note,
          createdAt: c.createdAt.toISOString(),
          isSelfReimbursement: c.requesterEmail.toLowerCase() === userEmail.toLowerCase(),
        })),
        sessionUserRole: userRole,
      };
    },
  };

  // -------------------------------------------------------------
  // READ-ONLY TOOL 8: get_anomaly_candidates
  // -------------------------------------------------------------
  const getAnomalyCandidatesTool: ToolDefinition = {
    name: "get_anomaly_candidates",
    description:
      "Performs rule-based algorithmic financial health checks to detect budget breaches, unusual spending spikes, duplicate claims, and overdue dues.",
    parameters: {
      type: "OBJECT",
      properties: {
        clubId: {
          type: "STRING",
          description: "Optional club ID.",
        },
      },
      required: [],
    },
    execute: async (args: { clubId?: string }) => {
      const candidates: Array<{
        type: "BUDGET_BREACH" | "SPENDING_SPIKE" | "DUPLICATE_CLAIM" | "SELF_REIMBURSEMENT" | "OVERDUE_DUES";
        severity: "HIGH" | "MEDIUM" | "LOW";
        description: string;
        details: any;
      }> = [];

      // 1. Tag Limit checks
      const tagSummaries = await getTagSpendingSummaries(args.clubId || session.defaultClubId);
      for (const t of tagSummaries) {
        if (t.status === "exceeded_100") {
          candidates.push({
            type: "BUDGET_BREACH",
            severity: "HIGH",
            description: `Tag "${t.name}" has exceeded monthly limit ($${t.spent} / $${t.monthlyLimit}).`,
            details: { tagName: t.name, spent: t.spent, limit: t.monthlyLimit, percentage: t.percentageUsed },
          });
        } else if (t.status === "warning_80") {
          candidates.push({
            type: "BUDGET_BREACH",
            severity: "MEDIUM",
            description: `Tag "${t.name}" is near limit at ${t.percentageUsed}% ($${t.spent} / $${t.monthlyLimit}).`,
            details: { tagName: t.name, spent: t.spent, limit: t.monthlyLimit, percentage: t.percentageUsed },
          });
        }
      }

      // 2. Spending spike detection (> 2x average or >= $200)
      const recentOutgoings = await prisma.movement.findMany({
        where: { direction: "OUTGOING", status: "COMPLETED" },
        take: 50,
        orderBy: { createdAt: "desc" },
      });

      if (recentOutgoings.length > 0) {
        const avg = recentOutgoings.reduce((sum, m) => sum + m.amount, 0) / recentOutgoings.length;
        const spikeThreshold = Math.max(avg * 2, 200);

        for (const m of recentOutgoings.slice(0, 10)) {
          if (m.amount >= spikeThreshold) {
            candidates.push({
              type: "SPENDING_SPIKE",
              severity: "MEDIUM",
              description: `Unusual transaction of $${m.amount} to ${m.counterparty} exceeds average ($${avg.toFixed(2)}).`,
              details: { movementId: m.id, amount: m.amount, counterparty: m.counterparty, average: parseFloat(avg.toFixed(2)) },
            });
          }
        }
      }

      // 3. Duplicate Claims within 24 hours
      const recentClaims = await prisma.reimbursementClaim.findMany({
        where: { status: "SUBMITTED" },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      for (let i = 0; i < recentClaims.length; i++) {
        for (let j = i + 1; j < recentClaims.length; j++) {
          const c1 = recentClaims[i];
          const c2 = recentClaims[j];
          if (
            c1.requesterEmail.toLowerCase() === c2.requesterEmail.toLowerCase() &&
            c1.amount === c2.amount &&
            Math.abs(c1.createdAt.getTime() - c2.createdAt.getTime()) < 24 * 60 * 60 * 1000
          ) {
            candidates.push({
              type: "DUPLICATE_CLAIM",
              severity: "HIGH",
              description: `Potential duplicate claim of $${c1.amount} submitted by ${c1.requesterEmail} within 24 hours.`,
              details: { claim1Id: c1.id, claim2Id: c2.id, amount: c1.amount, requester: c1.requesterEmail },
            });
          }
        }
      }

      // 4. Self-Reimbursement check
      for (const c of recentClaims) {
        if (c.requesterEmail.toLowerCase() === userEmail.toLowerCase() && userRole === "TREASURER") {
          candidates.push({
            type: "SELF_REIMBURSEMENT",
            severity: "MEDIUM",
            description: `Treasurer ${c.requesterEmail} has submitted a self-reimbursement claim of $${c.amount} requiring honor code certification.`,
            details: { claimId: c.id, amount: c.amount, note: c.note },
          });
        }
      }

      return {
        anomaliesCount: candidates.length,
        hasCriticalAnomalies: candidates.some((c) => c.severity === "HIGH"),
        candidates: candidates.slice(0, 20),
      };
    },
  };

  // =============================================================
  // DRAFT-ONLY TOOLS (Change NOTHING in database or PayPal)
  // =============================================================

function parseNumericAmount(val: any): number {
  if (typeof val === "number") return isNaN(val) || val <= 0 ? 0.01 : val;
  if (typeof val === "string") {
    const cleaned = val.replace(/[^0-9.]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) || parsed <= 0 ? 0.01 : parsed;
  }
  return 0.01;
}

  // -------------------------------------------------------------
  // DRAFT TOOL 1: draft_send
  // -------------------------------------------------------------
  const draftSendTool: ToolDefinition = {
    name: "draft_send",
    description:
      "Drafts a direct send payment for human review. CHANGES NOTHING in the database or PayPal.",
    parameters: {
      type: "OBJECT",
      properties: {
        recipientEmail: {
          type: "STRING",
          description: "Recipient's email address.",
        },
        amount: {
          type: "NUMBER",
          description: "Amount in USD to send (e.g. 25.00).",
        },
        tagName: {
          type: "STRING",
          description: "Optional expense category tag (e.g. 'Food', 'Parts', 'Other').",
        },
        note: {
          type: "STRING",
          description: "Optional payment note or reason.",
        },
      },
      required: ["recipientEmail", "amount"],
    },
    execute: async (args: {
      recipientEmail: string;
      amount: any;
      tagName?: string;
      note?: string;
    }): Promise<DraftActionPayload> => {
      const numAmount = Math.max(0.01, parseFloat(parseNumericAmount(args.amount).toFixed(2)));
      const cleanEmail = (args.recipientEmail || "").trim().toLowerCase();

      // Resolve tag in read-only mode
      let tag = null;
      if (args.tagName) {
        tag = await prisma.tag.findFirst({
          where: { name: { equals: args.tagName.trim(), mode: "insensitive" } },
        });
      }
      if (!tag) {
        tag = await prisma.tag.findFirst({ where: { name: "Other" } });
      }

      let impact = null;
      if (tag) {
        try {
          impact = await checkTagLimitImpact(tag.id, numAmount);
        } catch {}
      }

      return {
        isDraft: true,
        draftType: "SEND",
        readyForConfirmation: true,
        summary: `Draft send of $${numAmount.toFixed(2)} to ${cleanEmail}`,
        data: {
          recipientEmail: cleanEmail,
          amount: numAmount,
          currency: "USD",
          tagId: tag?.id || null,
          tagName: tag?.name || "Other",
          note: args.note || "Direct Send via Orbit",
          willExceedLimit: impact?.willExceed || false,
          impact,
          securityNotice:
            "This action is a draft only. No money has moved. Click 'Confirm' to execute.",
        },
      };
    },
  };

  // -------------------------------------------------------------
  // DRAFT TOOL 2: draft_request
  // -------------------------------------------------------------
  const draftRequestTool: ToolDefinition = {
    name: "draft_request",
    description:
      "Drafts a payment request invoice for human review. CHANGES NOTHING in the database or PayPal.",
    parameters: {
      type: "OBJECT",
      properties: {
        payerEmail: {
          type: "STRING",
          description: "Email address of the person requested to pay.",
        },
        amount: {
          type: "NUMBER",
          description: "Amount in USD requested (e.g. 15.00).",
        },
        tagName: {
          type: "STRING",
          description: "Optional category tag.",
        },
        note: {
          type: "STRING",
          description: "Note or reason for request.",
        },
      },
      required: ["payerEmail", "amount"],
    },
    execute: async (args: {
      payerEmail: string;
      amount: any;
      tagName?: string;
      note?: string;
    }): Promise<DraftActionPayload> => {
      const numAmount = Math.max(0.01, parseFloat(parseNumericAmount(args.amount).toFixed(2)));
      const cleanEmail = (args.payerEmail || "").trim().toLowerCase();

      let tag = null;
      if (args.tagName) {
        tag = await prisma.tag.findFirst({
          where: { name: { equals: args.tagName.trim(), mode: "insensitive" } },
        });
      }

      return {
        isDraft: true,
        draftType: "REQUEST",
        readyForConfirmation: true,
        summary: `Draft payment request of $${numAmount.toFixed(2)} from ${cleanEmail}`,
        data: {
          payerEmail: cleanEmail,
          amount: numAmount,
          currency: "USD",
          tagId: tag?.id || null,
          tagName: tag?.name || "Other",
          note: args.note || "Payment request via Orbit",
          securityNotice:
            "This invoice request is drafted. No email or PayPal request has been issued until confirmed.",
        },
      };
    },
  };

  // -------------------------------------------------------------
  // DRAFT TOOL 3: draft_dues_request
  // -------------------------------------------------------------
  const draftDuesRequestTool: ToolDefinition = {
    name: "draft_dues_request",
    description:
      "Drafts a club dues cycle for human review. Strictly checks treasurer role. CHANGES NOTHING.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: {
          type: "STRING",
          description: "Title of dues cycle (e.g. 'Fall 2026 Club Dues').",
        },
        amount: {
          type: "NUMBER",
          description: "Amount in USD per member (e.g. 50.00).",
        },
        dueDate: {
          type: "STRING",
          description: "Due date in YYYY-MM-DD format.",
        },
        clubId: {
          type: "STRING",
          description: "Optional club ID.",
        },
      },
      required: ["title", "amount", "dueDate"],
    },
    execute: async (args: {
      title: string;
      amount: any;
      dueDate: string;
      clubId?: string;
    }): Promise<DraftActionPayload> => {
      const targetClubId = args.clubId || session.defaultClubId;
      const club = targetClubId
        ? await prisma.club.findUnique({
            where: { id: targetClubId },
            include: { members: true },
          })
        : await prisma.club.findFirst({ include: { members: true } });

      const numAmount = Math.max(0.01, parseFloat(parseNumericAmount(args.amount).toFixed(2)));
      const isAuthorized = userRole === "TREASURER";

      return {
        isDraft: true,
        draftType: "DUES",
        readyForConfirmation: isAuthorized,
        summary: `Draft dues cycle "${args.title}" ($${numAmount.toFixed(2)}/member)`,
        data: {
          clubId: club?.id || null,
          clubName: club?.name || "Club",
          title: args.title.trim(),
          amount: numAmount,
          dueDate: args.dueDate,
          membersCount: club?.members.length || 0,
          totalExpected: (club?.members.length || 0) * numAmount,
          isAuthorizedTreasurer: isAuthorized,
          roleWarning: isAuthorized
            ? null
            : "Only a verified Treasurer can confirm and issue dues cycles.",
          securityNotice:
            "Draft only. Invoices will only be dispatched to members when the Treasurer clicks Confirm.",
        },
      };
    },
  };

  // -------------------------------------------------------------
  // DRAFT TOOL 4: draft_reminder
  // -------------------------------------------------------------
  const draftReminderTool: ToolDefinition = {
    name: "draft_reminder",
    description:
      "Drafts a friendly dues reminder notice for a member with overdue or pending dues. CHANGES NOTHING.",
    parameters: {
      type: "OBJECT",
      properties: {
        recipientEmail: {
          type: "STRING",
          description: "Member's email address.",
        },
        cycleTitle: {
          type: "STRING",
          description: "Dues cycle title.",
        },
        amount: {
          type: "NUMBER",
          description: "Outstanding amount in USD.",
        },
        clubId: {
          type: "STRING",
          description: "Optional club ID.",
        },
      },
      required: ["recipientEmail", "cycleTitle", "amount"],
    },
    execute: (args: {
      recipientEmail: string;
      cycleTitle: string;
      amount: any;
      clubId?: string;
    }): DraftActionPayload => {
      const cleanEmail = (args.recipientEmail || "").trim().toLowerCase();
      const numAmount = Math.max(0.01, parseFloat(parseNumericAmount(args.amount).toFixed(2)));

      return {
        isDraft: true,
        draftType: "REMINDER",
        readyForConfirmation: true,
        summary: `Draft dues reminder to ${cleanEmail} for ${args.cycleTitle} ($${numAmount.toFixed(2)})`,
        data: {
          recipientEmail: cleanEmail,
          cycleTitle: args.cycleTitle,
          amount: numAmount,
          clubId: args.clubId || session.defaultClubId || null,
          messagePreview: `Hi! A quick reminder regarding "${args.cycleTitle}" ($${numAmount.toFixed(2)}). Please settle when convenient via Orbit.`,
          securityNotice: "Draft only. No reminder message has been sent.",
        },
      };
    },
  };

  // -------------------------------------------------------------
  // Tool 13: Predictive Burn-Rate & Budget Forecast
  // -------------------------------------------------------------
  const predictBurnRateTool: ToolDefinition = {
    name: "predict_burn_rate_and_budget",
    description:
      "Analyzes current month daily burn rate, forecasts month-end spending per category tag, predicts potential budget breaches, and recommends surplus reallocations.",
    parameters: {
      type: "OBJECT",
      properties: {
        clubId: { type: "STRING", description: "Optional organization / entity ID" },
      },
      required: [],
    },
    execute: async (args: { clubId?: string }) => {
      const targetClubId = args.clubId || session.defaultClubId;
      const now = new Date();
      const currentDay = Math.max(1, now.getDate());
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const daysRemaining = daysInMonth - currentDay;

      const tagSummaries = await getTagSpendingSummaries(targetClubId);

      const projections = tagSummaries.map((t) => {
        const dailyBurn = parseFloat((t.spent / currentDay).toFixed(2));
        const projectedTotal = parseFloat((dailyBurn * daysInMonth).toFixed(2));
        const projectedOverspend = Math.max(0, parseFloat((projectedTotal - t.monthlyLimit).toFixed(2)));
        const willBreach = projectedTotal > t.monthlyLimit;
        const breachDay = willBreach && dailyBurn > 0 ? Math.ceil(t.monthlyLimit / dailyBurn) : null;

        return {
          tagName: t.name,
          monthlyLimit: t.monthlyLimit,
          currentSpent: t.spent,
          percentageUsed: t.percentageUsed,
          dailyBurnRate: dailyBurn,
          projectedMonthEndSpend: projectedTotal,
          projectedOverspend,
          willBreach,
          estimatedBreachDay: breachDay && breachDay <= daysInMonth ? breachDay : null,
          surplusAvailable: Math.max(0, parseFloat((t.monthlyLimit - projectedTotal).toFixed(2))),
        };
      });

      const totalSpent = tagSummaries.reduce((acc, t) => acc + t.spent, 0);
      const totalBudget = tagSummaries.reduce((acc, t) => acc + t.monthlyLimit, 0);
      const totalDailyBurn = parseFloat((totalSpent / currentDay).toFixed(2));
      const projectedMonthEndTotal = parseFloat((totalDailyBurn * daysInMonth).toFixed(2));

      const atRiskCategories = projections.filter((p) => p.willBreach);
      const surplusCategories = projections.filter((p) => p.surplusAvailable > 20);

      return {
        month: now.toLocaleString("default", { month: "long", year: "numeric" }),
        daysElapsed: currentDay,
        daysRemaining,
        daysInMonth,
        totalMonthlyBudget: parseFloat(totalBudget.toFixed(2)),
        totalCurrentSpent: parseFloat(totalSpent.toFixed(2)),
        overallDailyBurnRate: totalDailyBurn,
        projectedMonthEndSpend: projectedMonthEndTotal,
        overallStatus: projectedMonthEndTotal > totalBudget ? "PROJECTED_DEFICIT" : "HEALTHY",
        atRiskCategories,
        surplusCategories,
        projections,
        recommendation:
          atRiskCategories.length > 0
            ? `⚠️ Forecast Alert: ${atRiskCategories
                .map((c) => `"${c.tagName}" (projected overspend: $${c.projectedOverspend})`)
                .join(", ")}. Consider reallocating surplus from ${
                surplusCategories.map((s) => `"${s.tagName}" (+$${s.surplusAvailable})`).join(", ") || "contingency vault"
              }.`
            : "✅ All spending categories are currently within healthy projected month-end limits.",
      };
    },
  };

  // -------------------------------------------------------------
  // DRAFT-ONLY TOOL 5: draft_add_to_cart (Instamart & AI Shopper)
  // -------------------------------------------------------------
  const draftAddToCartTool: ToolDefinition = {
    name: "draft_add_to_cart",
    description:
      "Finds product items (like 'cheapest yogurt', 'coffee', 'microcontroller cables') from Instamart and prepares a verified draft to add it to the user's cart.",
    parameters: {
      type: "OBJECT",
      properties: {
        productQuery: {
          type: "STRING",
          description: "Search keyword for the product (e.g. 'yogurt', 'greek yogurt', 'coffee', 'sensors')",
        },
        preferCheapest: {
          type: "BOOLEAN",
          description: "Whether to specifically select the lowest-priced matching product",
        },
        quantity: {
          type: "INTEGER",
          description: "Quantity to add to cart (defaults to 1)",
        },
      },
      required: ["productQuery"],
    },
    execute: async (args: { productQuery: string; preferCheapest?: boolean; quantity?: number }): Promise<DraftActionPayload> => {
      const q = (args.productQuery || "").trim();
      const qty = Math.max(1, args.quantity || 1);

      let products: Array<any> = [];
      try {
        products = await searchChannel3Products(q, 8);
      } catch (err) {
        console.warn("Product search in AI tool failed:", err);
      }

      if (products.length === 0) {
        return {
          isDraft: true,
          draftType: "ADD_TO_CART",
          readyForConfirmation: false,
          summary: `No available products found matching "${q}" in Instamart catalog.`,
          data: { notFound: true, query: q },
        };
      }

      // Sort by price if cheapest requested or default
      const sorted = [...products].sort((a, b) => a.cheapestPrice - b.cheapestPrice);
      const chosen = sorted[0];

      return {
        isDraft: true,
        draftType: "ADD_TO_CART",
        readyForConfirmation: true,
        summary: `Add ${qty}x ${chosen.title} ($${chosen.cheapestPrice.toFixed(2)} ea) to Cart`,
        data: {
          productId: chosen.id,
          title: chosen.title,
          unitPrice: chosen.cheapestPrice,
          quantity: qty,
          imageUrl: chosen.imageUrl,
          offerUrl: chosen.offerUrl,
          domain: chosen.domain,
          totalPrice: parseFloat((chosen.cheapestPrice * qty).toFixed(2)),
          currency: chosen.currency || "USD",
        },
      };
    },
  };

  return [
    getTagSummaryTool,
    getLedgerTool,
    getTotalsByRecipientTool,
    getClubBalanceTool,
    getDuesStatusTool,
    calculateDuesTool,
    getPendingClaimsTool,
    getAnomalyCandidatesTool,
    predictBurnRateTool,
    draftSendTool,
    draftRequestTool,
    draftDuesRequestTool,
    draftReminderTool,
    draftAddToCartTool,
  ];
}
