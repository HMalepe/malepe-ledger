import {
  format,
  startOfMonth,
  subMonths,
} from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getInsightMonthRange } from "./build-summary";
import type {
  CachedInsight,
  InsightDebtActivity,
  InsightTransaction,
  MonthInsightSummary,
} from "./types";

export function mapCachedInsight(row: Record<string, unknown>): CachedInsight {
  return {
    id: row.id as string,
    month: row.month as string,
    income_total: Number(row.income_total),
    expense_total: Number(row.expense_total),
    surplus: Number(row.surplus),
    ai_summary: (row.ai_summary as string | null) ?? null,
    ai_flags: Array.isArray(row.ai_flags) ? (row.ai_flags as string[]) : [],
    generated_at: row.generated_at as string,
    generation_status:
      (row.generation_status as "success" | "failed") ?? "success",
    generation_error: (row.generation_error as string | null) ?? null,
    context_json: (row.context_json as MonthInsightSummary | null) ?? null,
  };
}

export async function fetchInsightSourceData(
  supabase: SupabaseClient,
  householdId: string,
  month: Date,
  deepHistoryMonths?: number
) {
  const range = getInsightMonthRange(month);
  const fetchFrom = deepHistoryMonths
    ? format(
        startOfMonth(subMonths(startOfMonth(month), deepHistoryMonths)),
        "yyyy-MM-dd"
      )
    : range.priorStartKey;
  const fetchTo = range.currentMonthEnd;

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("household_id", householdId)
    .order("display_name");

  if (profilesError) throw new Error(profilesError.message);

  const { data: transactionsRaw, error: transactionsError } = await supabase
    .from("transactions")
    .select(
      `
      id,
      date,
      description,
      amount,
      category,
      tx_type,
      is_billing_error,
      accounts!inner (
        owner_profile_id,
        profiles!accounts_owner_profile_id_fkey (display_name)
      )
    `
    )
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .eq("is_internal_transfer", false)
    .gte("date", fetchFrom)
    .lt("date", fetchTo);

  if (transactionsError) throw new Error(transactionsError.message);

  const transactions: InsightTransaction[] = (transactionsRaw ?? []).map((tx) => {
    const account = Array.isArray(tx.accounts) ? tx.accounts[0] : tx.accounts;
    const owner = account?.profiles
      ? Array.isArray(account.profiles)
        ? account.profiles[0]
        : account.profiles
      : null;
    return {
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: Number(tx.amount),
      category: tx.category,
      tx_type: tx.tx_type,
      owner_profile_id: account?.owner_profile_id ?? "",
      owner_display_name: owner?.display_name ?? "Unknown",
      is_billing_error: tx.is_billing_error,
    };
  });

  const { data: debtsRaw, error: debtsError } = await supabase
    .from("debts")
    .select("creditor_name, debt_type, amount, date_borrowed, repaid, repaid_at")
    .eq("household_id", householdId)
    .gte("date_borrowed", fetchFrom)
    .lt("date_borrowed", fetchTo);

  if (debtsError) throw new Error(debtsError.message);

  const debts: InsightDebtActivity[] = (debtsRaw ?? []).map((debt) => ({
    creditor_name: debt.creditor_name,
    debt_type: debt.debt_type,
    amount: Number(debt.amount),
    date_borrowed: debt.date_borrowed,
    repaid: debt.repaid,
    repaid_at: debt.repaid_at,
  }));

  return { profiles: profiles ?? [], transactions, debts };
}

export async function getHouseholdCostState(
  supabase: SupabaseClient,
  householdId: string
) {
  const { data, error } = await supabase
    .from("households")
    .select(
      "monthly_ai_cost_cents, monthly_ai_usage_month, insights_cost_ceiling_cents, last_auto_insights_at"
    )
    .eq("id", householdId)
    .single();

  if (error) throw new Error(error.message);

  const currentUsageMonth = format(startOfMonth(new Date()), "yyyy-MM-dd");
  let costUsed = Number(data.monthly_ai_cost_cents ?? 0);
  const ceiling = Number(data.insights_cost_ceiling_cents ?? 500);

  if (data.monthly_ai_usage_month !== currentUsageMonth) {
    costUsed = 0;
  }

  return {
    costUsedCents: costUsed,
    costCeilingCents: ceiling,
    costLimitReached: costUsed >= ceiling,
    lastAutoInsightsAt: data.last_auto_insights_at as string | null,
    currentUsageMonth,
  };
}

export async function recordApiCost(
  supabase: SupabaseClient,
  householdId: string,
  costCents: number,
  currentUsageMonth: string
) {
  const state = await getHouseholdCostState(supabase, householdId);
  const baseCost =
    state.currentUsageMonth === currentUsageMonth ? state.costUsedCents : 0;

  await supabase
    .from("households")
    .update({
      monthly_ai_cost_cents: baseCost + costCents,
      monthly_ai_usage_month: currentUsageMonth,
    })
    .eq("id", householdId);
}

export async function getCachedInsight(
  supabase: SupabaseClient,
  householdId: string,
  monthKey: string
): Promise<CachedInsight | null> {
  const { data, error } = await supabase
    .from("monthly_insights")
    .select("*")
    .eq("household_id", householdId)
    .eq("month", monthKey)
    .eq("generation_status", "success")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapCachedInsight(data) : null;
}
