export type InsightTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string | null;
  tx_type: string;
  owner_profile_id: string;
  owner_display_name: string;
  is_billing_error: boolean;
};

export type InsightDebtActivity = {
  creditor_name: string;
  debt_type: string;
  amount: number;
  date_borrowed: string;
  repaid: boolean;
  repaid_at: string | null;
};

export type CategoryTotals = Record<string, number>;

export type PersonSummary = {
  profile_id: string;
  name: string;
  income: number;
  expenses: number;
  surplus: number;
  by_category: CategoryTotals;
};

export type RecurringCandidate = {
  description: string;
  count: number;
  total: number;
  average: number;
};

export type BiggestTransaction = {
  date: string;
  description: string;
  amount: number;
  category: string | null;
  owner_display_name: string;
};

export type MonthInsightSummary = {
  month: string;
  prior_month: string;
  scope: "household" | "person";
  household: {
    income_total: number;
    expense_total: number;
    surplus: number;
  };
  by_category: {
    current: CategoryTotals;
    prior: CategoryTotals;
    change_pct: Record<string, number | null>;
    pct_of_household_income: Record<string, number | null>;
  };
  by_person: PersonSummary[];
  debt_activity: InsightDebtActivity[];
  biggest_transactions: BiggestTransaction[];
  recurring_small_candidates: RecurringCandidate[];
  new_merchants: string[];
  month_over_month_comparisons: {
    category: string;
    current_amount: number;
    prior_amount: number;
    change_pct: number | null;
  }[];
};

export type InsightFlag = string;

export type CachedInsight = {
  id: string;
  month: string;
  income_total: number;
  expense_total: number;
  surplus: number;
  ai_summary: string | null;
  ai_flags: InsightFlag[];
  generated_at: string;
  generation_status: "success" | "failed";
  generation_error: string | null;
  context_json: MonthInsightSummary | null;
};

export type InsightsPageData = {
  householdId: string;
  selectedMonth: string;
  monthLabel: string;
  cached: CachedInsight | null;
  lastSuccessful: CachedInsight | null;
  costUsedCents: number;
  costCeilingCents: number;
  costLimitReached: boolean;
  canAutoGenerateToday: boolean;
  monthComparisons: MonthInsightSummary["month_over_month_comparisons"];
  priorMonthLabel: string;
};

export type GenerateInsightsResult =
  | {
      success: true;
      insight: CachedInsight;
      fromCache: boolean;
    }
  | {
      success: false;
      error: string;
      lastSuccessful: CachedInsight | null;
      costLimitReached?: boolean;
    };

export type AskInsightResult =
  | { success: true; answer: string }
  | { success: false; error: string; costLimitReached?: boolean };
