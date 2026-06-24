import {
  addMonths,
  format,
  startOfMonth,
  subMonths,
} from "date-fns";

import type {
  BiggestTransaction,
  CategoryTotals,
  InsightDebtActivity,
  InsightTransaction,
  MonthInsightSummary,
  PersonSummary,
  RecurringCandidate,
} from "./types";

function monthKey(date: Date): string {
  return format(startOfMonth(date), "yyyy-MM-dd");
}

function categoryLabel(category: string | null): string {
  return category?.trim() || "Uncategorised";
}

function isCountable(tx: InsightTransaction): boolean {
  return !tx.is_billing_error && tx.tx_type !== "internal_transfer";
}

function isExpense(tx: InsightTransaction): boolean {
  return isCountable(tx) && tx.tx_type === "expense";
}

function isIncome(tx: InsightTransaction): boolean {
  return isCountable(tx) && tx.tx_type === "income";
}

function sumByCategory(transactions: InsightTransaction[]): CategoryTotals {
  const totals: CategoryTotals = {};
  for (const tx of transactions.filter(isExpense)) {
    const key = categoryLabel(tx.category);
    totals[key] = (totals[key] ?? 0) + Math.abs(tx.amount);
  }
  return totals;
}

function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return current > 0 ? 100 : null;
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

function normalizeDescription(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, " ");
}

function findRecurringSmall(
  transactions: InsightTransaction[]
): RecurringCandidate[] {
  const groups = new Map<string, { count: number; total: number }>();

  for (const tx of transactions.filter(isExpense)) {
    const amount = Math.abs(tx.amount);
    if (amount > 200) continue;
    const key = normalizeDescription(tx.description);
    const entry = groups.get(key) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += amount;
    groups.set(key, entry);
  }

  return Array.from(groups.entries())
    .filter(([, value]) => value.count >= 2 && value.total >= 150)
    .map(([description, value]) => ({
      description,
      count: value.count,
      total: Math.round(value.total * 100) / 100,
      average: Math.round((value.total / value.count) * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
}

function findNewMerchants(
  current: InsightTransaction[],
  prior: InsightTransaction[]
): string[] {
  const priorSet = new Set(
    prior.filter(isExpense).map((tx) => normalizeDescription(tx.description))
  );
  const newcomers = new Set<string>();
  for (const tx of current.filter(isExpense)) {
    const key = normalizeDescription(tx.description);
    if (!priorSet.has(key)) {
      newcomers.add(tx.description.trim());
    }
  }
  return Array.from(newcomers).slice(0, 15);
}

function buildPersonSummaries(
  transactions: InsightTransaction[],
  profiles: { id: string; display_name: string }[]
): PersonSummary[] {
  return profiles.map((profile) => {
    const personTx = transactions.filter(
      (tx) => tx.owner_profile_id === profile.id
    );
    const income = personTx
      .filter(isIncome)
      .reduce((sum, tx) => sum + tx.amount, 0);
    const expenses = personTx
      .filter(isExpense)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    return {
      profile_id: profile.id,
      name: profile.display_name,
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      surplus: Math.round((income - expenses) * 100) / 100,
      by_category: sumByCategory(personTx),
    };
  });
}

export function getInsightMonthRange(month: Date) {
  const currentStart = startOfMonth(month);
  const priorStart = startOfMonth(subMonths(currentStart, 1));
  return {
    currentMonthKey: monthKey(currentStart),
    priorMonthKey: monthKey(priorStart),
    currentMonthEnd: format(addMonths(currentStart, 1), "yyyy-MM-dd"),
    priorMonthEnd: format(currentStart, "yyyy-MM-dd"),
    priorStartKey: monthKey(priorStart),
  };
}

export function buildMonthInsightSummary(input: {
  month: Date;
  transactions: InsightTransaction[];
  debts: InsightDebtActivity[];
  profiles: { id: string; display_name: string }[];
  scope?: "household" | "person";
  profileId?: string | null;
  passThroughTransactionIds?: Set<string>;
}): MonthInsightSummary {
  const range = getInsightMonthRange(input.month);
  const scope = input.scope ?? "household";
  const passThroughIds = input.passThroughTransactionIds ?? new Set();

  let allTransactions = input.transactions
    .filter((tx) => !passThroughIds.has(tx.id))
    .filter(isCountable);
  if (scope === "person" && input.profileId) {
    allTransactions = allTransactions.filter(
      (tx) => tx.owner_profile_id === input.profileId
    );
  }

  const currentTransactions = allTransactions.filter(
    (tx) => tx.date >= range.currentMonthKey && tx.date < range.currentMonthEnd
  );
  const priorTransactions = allTransactions.filter(
    (tx) => tx.date >= range.priorStartKey && tx.date < range.priorMonthEnd
  );

  const incomeTotal = currentTransactions
    .filter(isIncome)
    .reduce((sum, tx) => sum + tx.amount, 0);
  const expenseTotal = currentTransactions
    .filter(isExpense)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const currentByCategory = sumByCategory(currentTransactions);
  const priorByCategory = sumByCategory(priorTransactions);

  const allCategories = new Set([
    ...Object.keys(currentByCategory),
    ...Object.keys(priorByCategory),
  ]);

  const changePct: Record<string, number | null> = {};
  const pctOfIncome: Record<string, number | null> = {};
  const monthOverMonth: MonthInsightSummary["month_over_month_comparisons"] = [];

  for (const category of Array.from(allCategories)) {
    const current = currentByCategory[category] ?? 0;
    const prior = priorByCategory[category] ?? 0;
    changePct[category] = pctChange(current, prior);
    pctOfIncome[category] =
      incomeTotal > 0
        ? Math.round((current / incomeTotal) * 1000) / 10
        : null;
    monthOverMonth.push({
      category,
      current_amount: Math.round(current * 100) / 100,
      prior_amount: Math.round(prior * 100) / 100,
      change_pct: pctChange(current, prior),
    });
  }

  monthOverMonth.sort((a, b) => b.current_amount - a.current_amount);

  const biggest: BiggestTransaction[] = currentTransactions
    .filter(isExpense)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 8)
    .map((tx) => ({
      date: tx.date,
      description: tx.description,
      amount: Math.abs(tx.amount),
      category: tx.category,
      owner_display_name: tx.owner_display_name,
    }));

  return {
    month: range.currentMonthKey,
    prior_month: range.priorMonthKey,
    scope,
    household: {
      income_total: Math.round(incomeTotal * 100) / 100,
      expense_total: Math.round(expenseTotal * 100) / 100,
      surplus: Math.round((incomeTotal - expenseTotal) * 100) / 100,
    },
    by_category: {
      current: currentByCategory,
      prior: priorByCategory,
      change_pct: changePct,
      pct_of_household_income: pctOfIncome,
    },
    by_person: buildPersonSummaries(currentTransactions, input.profiles),
    debt_activity: input.debts,
    biggest_transactions: biggest,
    recurring_small_candidates: findRecurringSmall(currentTransactions),
    new_merchants: findNewMerchants(currentTransactions, priorTransactions),
    month_over_month_comparisons: monthOverMonth,
  };
}

export function buildDeepHistorySummary(input: {
  month: Date;
  monthsBack: number;
  transactions: InsightTransaction[];
  debts: InsightDebtActivity[];
  profiles: { id: string; display_name: string }[];
  passThroughTransactionIds?: Set<string>;
}): MonthInsightSummary & {
  deep_history: true;
  months_included: number;
  monthly_expense_totals: Record<string, number>;
} {
  const passThroughIds = input.passThroughTransactionIds ?? new Set();
  const base = buildMonthInsightSummary({
    month: input.month,
    transactions: input.transactions,
    debts: input.debts,
    profiles: input.profiles,
    passThroughTransactionIds: passThroughIds,
  });

  const monthlyTotals: Record<string, number> = {};
  for (const tx of input.transactions) {
    if (passThroughIds.has(tx.id)) continue;
    if (tx.tx_type !== "expense" || tx.is_billing_error) continue;
    const monthKey = tx.date.slice(0, 7);
    monthlyTotals[monthKey] =
      (monthlyTotals[monthKey] ?? 0) + Math.abs(tx.amount);
  }

  return {
    ...base,
    deep_history: true,
    months_included: input.monthsBack,
    monthly_expense_totals: monthlyTotals,
  };
}
