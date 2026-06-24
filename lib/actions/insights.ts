"use server";

import { revalidatePath } from "next/cache";
import { format, parseISO, startOfMonth } from "date-fns";

import { askInsightQuestion as callAskInsight } from "@/lib/insights/anthropic";
import { buildMonthInsightSummary, getInsightMonthRange } from "@/lib/insights/build-summary";
import {
  fetchInsightSourceData,
  getCachedInsight,
  getHouseholdCostState,
  recordApiCost,
} from "@/lib/insights/data";
import { runInsightGeneration } from "@/lib/insights/generate-core";
import type {
  AskInsightResult,
  GenerateInsightsResult,
  InsightsPageData,
  MonthInsightSummary,
} from "@/lib/insights/types";
import { createClient } from "@/lib/supabase/server";
import { fetchPassThroughTransactionIds } from "@/lib/transactions/exclusions";
import {
  getHouseholdViewingMonth,
} from "@/lib/household/viewing-month";

async function getHouseholdContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Not authenticated");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, household_id, display_name")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("Profile not found");
  }

  return { supabase, profile };
}

export async function getInsightsPageData(month?: string): Promise<InsightsPageData> {
  const { supabase, profile } = await getHouseholdContext();

  let selected: Date;
  if (month) {
    selected = startOfMonth(parseISO(month));
  } else {
    const viewing = await getHouseholdViewingMonth(supabase, profile.household_id);
    selected = viewing.month;
  }

  const monthKey = format(selected, "yyyy-MM-dd");
  const range = getInsightMonthRange(selected);

  const costState = await getHouseholdCostState(supabase, profile.household_id);
  const cached = await getCachedInsight(supabase, profile.household_id, monthKey);

  const { profiles, transactions, debts } = await fetchInsightSourceData(
    supabase,
    profile.household_id,
    selected
  );

  const passThroughTransactionIds = await fetchPassThroughTransactionIds(
    supabase,
    profile.household_id
  );

  const summary = buildMonthInsightSummary({
    month: selected,
    transactions,
    debts,
    profiles,
    passThroughTransactionIds,
  });

  return {
    householdId: profile.household_id,
    selectedMonth: monthKey,
    monthLabel: format(selected, "MMMM yyyy"),
    cached,
    lastSuccessful: cached,
    costUsedCents: costState.costUsedCents,
    costCeilingCents: costState.costCeilingCents,
    costLimitReached: costState.costLimitReached,
    canAutoGenerateToday: !costState.lastAutoInsightsAt?.startsWith(
      format(new Date(), "yyyy-MM-dd")
    ),
    monthComparisons: summary.month_over_month_comparisons.filter(
      (row) => row.prior_amount > 0 || row.current_amount > 0
    ),
    priorMonthLabel: format(parseISO(range.priorMonthKey), "MMMM yyyy"),
  };
}

export async function generateMonthlyInsights(
  householdId: string,
  month: string,
  options: { force?: boolean; auto?: boolean; deepHistoryMonths?: number } = {}
): Promise<GenerateInsightsResult> {
  try {
    const { supabase, profile } = await getHouseholdContext();

    if (householdId !== profile.household_id) {
      return { success: false, error: "Unauthorized household", lastSuccessful: null };
    }

    const monthKey = format(startOfMonth(parseISO(month)), "yyyy-MM-dd");
    const costState = await getHouseholdCostState(supabase, householdId);

    if (costState.costLimitReached) {
      const lastSuccessful = await getCachedInsight(supabase, householdId, monthKey);
      return {
        success: false,
        error:
          "This household has reached its monthly AI insights budget. Generation will resume next month.",
        lastSuccessful,
        costLimitReached: true,
      };
    }

    if (!options.force && !options.auto && !options.deepHistoryMonths) {
      const existing = await getCachedInsight(supabase, householdId, monthKey);
      if (existing) {
        return { success: true, insight: existing, fromCache: true };
      }
    }

    const result = await runInsightGeneration({
      supabase,
      householdId,
      month,
      deepHistoryMonths: options.deepHistoryMonths,
    });

    if (!result.success) {
      const lastSuccessful = await getCachedInsight(supabase, householdId, monthKey);
      return { success: false, error: result.error, lastSuccessful };
    }

    if (options.auto) {
      await supabase
        .from("households")
        .update({ last_auto_insights_at: new Date().toISOString() })
        .eq("id", householdId);
    }

    revalidatePath("/insights", "layout");
    return { success: true, insight: result.insight, fromCache: false };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate insights",
      lastSuccessful: null,
    };
  }
}

export async function askAboutMonth(input: {
  householdId: string;
  month: string;
  question: string;
}): Promise<AskInsightResult> {
  try {
    const { supabase, profile } = await getHouseholdContext();

    if (input.householdId !== profile.household_id) {
      return { success: false, error: "Unauthorized household" };
    }

    if (!input.question.trim()) {
      return { success: false, error: "Please enter a question." };
    }

    const monthKey = format(startOfMonth(parseISO(input.month)), "yyyy-MM-dd");
    const costState = await getHouseholdCostState(supabase, input.householdId);

    if (costState.costLimitReached) {
      return {
        success: false,
        error:
          "Monthly AI budget reached. Questions will be available again next month.",
        costLimitReached: true,
      };
    }

    let contextJson: MonthInsightSummary | null = null;
    const cached = await getCachedInsight(supabase, input.householdId, monthKey);
    contextJson = cached?.context_json ?? null;

    if (!contextJson) {
      const { profiles, transactions, debts } = await fetchInsightSourceData(
        supabase,
        input.householdId,
        parseISO(input.month)
      );
      const passThroughTransactionIds = await fetchPassThroughTransactionIds(
        supabase,
        input.householdId
      );
      contextJson = buildMonthInsightSummary({
        month: parseISO(input.month),
        transactions,
        debts,
        profiles,
        passThroughTransactionIds,
      });
    }

    let aiResult;
    try {
      aiResult = await callAskInsight({
        summaryJson: contextJson,
        question: input.question.trim(),
      });
    } catch (apiError) {
      return {
        success: false,
        error:
          apiError instanceof Error
            ? apiError.message
            : "Could not reach the AI service. Try again.",
      };
    }

    await recordApiCost(
      supabase,
      input.householdId,
      aiResult.costCents,
      costState.currentUsageMonth
    );

    return { success: true, answer: aiResult.summary };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to answer question",
    };
  }
}

export async function generateDeepHistoryInsights(
  householdId: string,
  month: string,
  monthsBack: number = 6
): Promise<GenerateInsightsResult> {
  return generateMonthlyInsights(householdId, month, {
    force: true,
    deepHistoryMonths: monthsBack,
  });
}
