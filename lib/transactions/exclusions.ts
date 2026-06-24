import type { SupabaseClient } from "@supabase/supabase-js";

export type MinimalTransaction = {
  id?: string;
  tx_type: string;
  is_internal_transfer?: boolean;
  is_billing_error?: boolean;
};

export async function fetchPassThroughTransactionIds(
  supabase: SupabaseClient,
  householdId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("debts")
    .select("inflow_transaction_id, outflow_transaction_id")
    .eq("household_id", householdId)
    .eq("debt_type", "pass_through");

  if (error) throw new Error(error.message);

  const ids = new Set<string>();
  for (const debt of data ?? []) {
    if (debt.inflow_transaction_id) ids.add(debt.inflow_transaction_id);
    if (debt.outflow_transaction_id) ids.add(debt.outflow_transaction_id);
  }
  return ids;
}

export function isExcludedFromHouseholdTotals(
  tx: MinimalTransaction,
  passThroughIds: Set<string> = new Set()
): boolean {
  if (tx.is_internal_transfer || tx.tx_type === "internal_transfer") return true;
  if (tx.is_billing_error) return true;
  if (tx.id && passThroughIds.has(tx.id)) return true;
  return false;
}

export function excludePassThrough<T extends { id: string }>(
  transactions: T[],
  passThroughIds: Set<string>
): T[] {
  if (passThroughIds.size === 0) return transactions;
  return transactions.filter((tx) => !passThroughIds.has(tx.id));
}

export function isRealExpenseTx(
  tx: MinimalTransaction,
  passThroughIds: Set<string> = new Set()
): boolean {
  return tx.tx_type === "expense" && !isExcludedFromHouseholdTotals(tx, passThroughIds);
}

export function isRealIncomeTx(
  tx: MinimalTransaction,
  passThroughIds: Set<string> = new Set()
): boolean {
  return tx.tx_type === "income" && !isExcludedFromHouseholdTotals(tx, passThroughIds);
}

export function computeHouseholdTotals(
  transactions: Array<MinimalTransaction & { amount: number }>,
  passThroughIds: Set<string> = new Set()
) {
  const income = transactions
    .filter((tx) => isRealIncomeTx(tx, passThroughIds))
    .reduce((sum, tx) => sum + tx.amount, 0);

  const expenses = transactions
    .filter((tx) => isRealExpenseTx(tx, passThroughIds))
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  return {
    income,
    expenses,
    surplus: income - expenses,
  };
}
