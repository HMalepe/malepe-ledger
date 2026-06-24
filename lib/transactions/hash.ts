import { createHash } from "node:crypto";

export function computeTransactionRowHash(input: {
  date: string;
  description: string;
  amount: number;
  accountId: string;
}): string {
  const normalizedAmount = input.amount.toFixed(2);
  const payload = `${input.date}|${input.description.trim()}|${normalizedAmount}|${input.accountId}`;
  return createHash("sha256").update(payload).digest("hex");
}
