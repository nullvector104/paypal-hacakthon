import { prisma } from "@/lib/prisma";

export interface TagSpendingSummary {
  id: string;
  name: string;
  monthlyLimit: number;
  clubId?: string | null;
  spent: number;
  remaining: number;
  percentageUsed: number;
  status: "normal" | "warning_80" | "exceeded_100";
}

/**
 * Returns UTC Date range for the current calendar month in Asia/Kolkata (UTC+5:30) window.
 * Rule: Timestamps stored in UTC, monthly window calculated for Asia/Kolkata.
 */
export function getCurrentMonthRange(): { start: Date; end: Date } {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowUtc = Date.now();
  const kolkataDate = new Date(nowUtc + IST_OFFSET_MS);

  const year = kolkataDate.getUTCFullYear();
  const month = kolkataDate.getUTCMonth(); // 0-indexed month (0 = Jan, 10 = Nov)

  // Start of calendar month in Asia/Kolkata: year-month-01 00:00:00.000 IST
  // Converted to UTC Date:
  const startMs = Date.UTC(year, month, 1, 0, 0, 0, 0) - IST_OFFSET_MS;
  const start = new Date(startMs);

  // End of calendar month in Asia/Kolkata: year-(month+1)-00 23:59:59.999 IST
  // Converted to UTC Date:
  const endMs = Date.UTC(year, month + 1, 0, 23, 59, 59, 999) - IST_OFFSET_MS;
  const end = new Date(endMs);

  return { start, end };
}

/**
 * Calculates current month spent for a specific tag or all tags.
 * Rule: Only COMPLETED outgoing movements in the current month count.
 */
export async function getTagSpendingSummaries(clubId?: string | null): Promise<TagSpendingSummary[]> {
  const { start, end } = getCurrentMonthRange();

  // Load tags (optionally filtered by club or personal)
  const tags = await prisma.tag.findMany({
    where: clubId !== undefined ? { clubId } : {},
    orderBy: { name: "asc" },
  });

  // Load all COMPLETED outgoing movements for the current month
  const movements = await prisma.movement.findMany({
    where: {
      status: "COMPLETED",
      direction: "OUTGOING",
      createdAt: {
        gte: start,
        lte: end,
      },
      tagId: {
        in: tags.map((t) => t.id),
      },
    },
    select: {
      tagId: true,
      amount: true,
    },
  });

  // Sum spending per tag
  const spentByTag = new Map<string, number>();
  for (const m of movements) {
    const current = spentByTag.get(m.tagId) || 0;
    spentByTag.set(m.tagId, current + m.amount);
  }

  return tags.map((tag) => {
    const spentRaw = spentByTag.get(tag.id) || 0;
    const spent = parseFloat(spentRaw.toFixed(2));
    const limit = tag.monthlyLimit;
    const remaining = parseFloat(Math.max(0, limit - spent).toFixed(2));
    const percentageUsed = limit > 0 ? parseFloat(((spent / limit) * 100).toFixed(1)) : 0;

    let status: "normal" | "warning_80" | "exceeded_100" = "normal";
    if (spent >= limit) {
      status = "exceeded_100";
    } else if (percentageUsed >= 80) {
      status = "warning_80";
    }

    return {
      id: tag.id,
      name: tag.name,
      monthlyLimit: limit,
      clubId: tag.clubId,
      spent,
      remaining,
      percentageUsed,
      status,
    };
  });
}

/**
 * Checks if adding `additionalAmount` to `tagId` would trigger an 80% or 100% limit breach.
 */
export async function checkTagLimitImpact(tagId: string, additionalAmount: number) {
  const { start, end } = getCurrentMonthRange();

  const tag = await prisma.tag.findUnique({
    where: { id: tagId },
  });

  if (!tag) {
    throw new Error(`Tag with ID ${tagId} not found`);
  }

  const existingMovements = await prisma.movement.findMany({
    where: {
      tagId,
      status: "COMPLETED",
      direction: "OUTGOING",
      createdAt: {
        gte: start,
        lte: end,
      },
    },
    select: { amount: true },
  });

  const currentSpent = existingMovements.reduce((sum, m) => sum + m.amount, 0);
  const projectedSpent = currentSpent + additionalAmount;
  const limit = tag.monthlyLimit;
  const projectedPercentage = limit > 0 ? (projectedSpent / limit) * 100 : 0;

  return {
    tagName: tag.name,
    limit,
    currentSpent: parseFloat(currentSpent.toFixed(2)),
    projectedSpent: parseFloat(projectedSpent.toFixed(2)),
    projectedPercentage: parseFloat(projectedPercentage.toFixed(1)),
    willExceed: projectedSpent > limit,
    willWarn80: projectedPercentage >= 80 && projectedSpent <= limit,
  };
}
