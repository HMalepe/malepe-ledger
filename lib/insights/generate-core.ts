import { format, parseISO, startOfMonth } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

import { generateInsightNarrative } from "./anthropic";
import {
  buildDeepHistorySummary,
  buildMonthInsightSummary,
} from "./build-summary";
import {
  fetchInsightSourceData,
  getHouseholdCostState,
  mapCachedInsight,
  recordApiCost,
} from "./data";
import type { CachedInsight } from "./types";
import { fetchPassThroughTransactionIds } from "@/lib/transactions/exclusions";

type GenerateCoreInput = {
  supabase: SupabaseClient;
  householdId: string;
  month: string;
  deepHistoryMonths?: number;
};

type GenerateCoreResult =
  | { success: true; insight: CachedInsight; costCents: number }
  | { success: false; error: string };

export async function runInsightGeneration(
  input: GenerateCoreInput
): Promise<GenerateCoreResult> {
  const selected = startOfMonth(parseISO(input.month));
  const monthKey = format(selected, "yyyy-MM-dd");

  const costState = await getHouseholdCostState(input.supabase, input.householdId);
  if (costState.costLimitReached) {
    return {
      success: false,
      error: "Monthly AI insights budget reached for this household.",
    };
  }

  const { profiles, transactions, debts } = await fetchInsightSourceData(
    input.supabase,
    input.householdId,
    selected,
    input.deepHistoryMonths
  );

  const passThroughTransactionIds = await fetchPassThroughTransactionIds(
    input.supabase,
    input.householdId
  );

  const summaryJson = input.deepHistoryMonths
    ? buildDeepHistorySummary({
        month: selected,
        monthsBack: input.deepHistoryMonths,
        transactions,
        debts,
        profiles,
        passThroughTransactionIds,
      })
    : buildMonthInsightSummary({
        month: selected,
        transactions,
        debts,
        profiles,
        passThroughTransactionIds,
      });

  let aiResult;
  try {
    aiResult = await generateInsightNarrative(summaryJson);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Anthropic API request failed",
    };
  }

  await recordApiCost(
    input.supabase,
    input.householdId,
    aiResult.costCents,
    costState.currentUsageMonth
  );

  const payload = {
    household_id: input.householdId,
    month: monthKey,
    currency: "ZAR",
    income_total: summaryJson.household.income_total,
    expense_total: summaryJson.household.expense_total,
    surplus: summaryJson.household.surplus,
    ai_summary: aiResult.summary,
    ai_flags: aiResult.flags,
    context_json: summaryJson,
    generation_status: "success",
    generation_error: null,
    input_tokens: aiResult.inputTokens,
    output_tokens: aiResult.outputTokens,
    generated_at: new Date().toISOString(),
  };

  const { data: upserted, error: upsertError } = await input.supabase
    .from("monthly_insights")
    .upsert(payload, { onConflict: "household_id,month" })
    .select("*")
    .single();

  if (upsertError) {
    return { success: false, error: upsertError.message };
  }

  return {
    success: true,
    insight: mapCachedInsight(upserted),
    costCents: aiResult.costCents,
  };
}
