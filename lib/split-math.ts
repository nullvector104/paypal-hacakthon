/**
 * Financial Split Math with Strict Penny Reconciliation
 * Guarantees that the sum of all participant shares strictly equals totalAmount.
 */

export interface SplitShare {
  email: string;
  isCreator: boolean;
  amount: number;
}

export interface SplitResult {
  totalAmount: number;
  totalParticipants: number;
  shares: SplitShare[];
  requestsToIssue: SplitShare[]; // Shares excluding creator if includeCreator = true
  allocatedTotal: number;
  reconciled: boolean;
}

export function calculateEqualSplit(params: {
  totalAmount: number;
  memberEmails: string[];
  includeCreator: boolean;
  creatorEmail: string;
}): SplitResult {
  const { totalAmount, memberEmails, includeCreator, creatorEmail } = params;

  // Deduplicate emails and normalize
  const cleanCreator = creatorEmail.trim().toLowerCase();
  const cleanMembers = Array.from(
    new Set(
      memberEmails
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0 && e !== cleanCreator)
    )
  );

  const participants: Array<{ email: string; isCreator: boolean }> = [];

  if (includeCreator) {
    participants.push({ email: cleanCreator, isCreator: true });
  }

  for (const m of cleanMembers) {
    participants.push({ email: m, isCreator: false });
  }

  const n = participants.length;
  if (n === 0) {
    throw new Error("Cannot split bill across 0 participants.");
  }

  // Work in cents to avoid IEEE 754 floating point imprecision
  const totalCents = Math.round(totalAmount * 100);
  const baseCentsPerPerson = Math.floor(totalCents / n);
  const remainderCents = totalCents - baseCentsPerPerson * n;

  // Distribute pennies to ensure sum(shares) === totalCents
  const shares: SplitShare[] = participants.map((p, index) => {
    // First `remainderCents` participants absorb one remainder penny
    const extraCent = index < remainderCents ? 1 : 0;
    const cents = baseCentsPerPerson + extraCent;
    return {
      email: p.email,
      isCreator: p.isCreator,
      amount: parseFloat((cents / 100).toFixed(2)),
    };
  });

  const allocatedTotal = parseFloat(
    (shares.reduce((sum, s) => sum + s.amount, 0)).toFixed(2)
  );

  const requestsToIssue = shares.filter((s) => !s.isCreator);

  return {
    totalAmount,
    totalParticipants: n,
    shares,
    requestsToIssue,
    allocatedTotal,
    reconciled: allocatedTotal === totalAmount,
  };
}
