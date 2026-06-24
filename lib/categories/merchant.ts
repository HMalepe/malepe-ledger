const STOP_WORDS = new Set([
  "card",
  "purchase",
  "payment",
  "transfer",
  "pos",
  "debit",
  "credit",
  "fee",
  "from",
  "the",
  "and",
  "for",
  "eft",
  "atm",
  "cash",
  "send",
  "paid",
  "bank",
]);

export function normalizeMerchantKey(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, " ");
}

export function extractMerchantTokens(description: string): string[] {
  const normalized = normalizeMerchantKey(description);
  if (!normalized) return [];

  const tokens = normalized
    .split(/[\s,/|*\-]+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 3);

  const meaningful = tokens.filter((token) => !STOP_WORDS.has(token));
  const keys = new Set<string>([normalized]);

  for (const token of meaningful) {
    keys.add(token);
  }

  if (meaningful.length > 0) {
    keys.add(meaningful[meaningful.length - 1]);
  }

  return Array.from(keys);
}

export type CategoryVote = {
  category: string;
  count: number;
};

export function pickDominantCategory(
  votes: CategoryVote[],
  minimumCount = 2
): { category: string; confidence: "high" | "medium" } | null {
  if (votes.length === 0) return null;

  const sorted = [...votes].sort((a, b) => b.count - a.count);
  const top = sorted[0];
  const second = sorted[1];

  if (!top || top.count < minimumCount) return null;

  if (!second || top.count > second.count) {
    return {
      category: top.category,
      confidence: top.count >= 3 ? "high" : "medium",
    };
  }

  if (top.count === second.count) {
    return null;
  }

  const ratio = top.count / (top.count + second.count);
  if (ratio >= 0.7) {
    return { category: top.category, confidence: "medium" };
  }

  return null;
}
