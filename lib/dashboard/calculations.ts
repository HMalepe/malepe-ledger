import {
  addDays,
  endOfMonth,
  format,
  getDaysInMonth,
  isAfter,
  isEqual,
  parseISO,
  startOfMonth,
} from "date-fns";

import type {
  DashboardAccount,
  DashboardDebt,
  DashboardStats,
  DashboardTransaction,
  DaysToZeroResult,
  RunningBalancePoint,
} from "./types";

export function isRealExpense(tx: DashboardTransaction): boolean {
  return (
    tx.tx_type === "expense" &&
    !tx.is_internal_transfer &&
    !tx.is_billing_error
  );
}

export function isRealIncome(tx: DashboardTransaction): boolean {
  return tx.tx_type === "income" && !tx.is_internal_transfer && !tx.is_billing_error;
}

export function computeStats(
  transactions: DashboardTransaction[],
  debts: DashboardDebt[]
): DashboardStats {
  const totalIncome = transactions
    .filter(isRealIncome)
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalExpenses = transactions
    .filter(isRealExpense)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const moneyOwed = debts
    .filter((debt) => !debt.repaid && debt.debt_type === "standard")
    .reduce((sum, debt) => sum + debt.amount, 0);

  return {
    totalIncome,
    totalExpenses,
    surplus: totalIncome - totalExpenses,
    moneyOwed,
  };
}

export function buildCategoryComparison(
  transactions: DashboardTransaction[],
  profileNames: string[]
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};

  for (const tx of transactions.filter(isRealExpense)) {
    const category = tx.category?.trim() || "Uncategorised";
    if (!result[category]) {
      result[category] = Object.fromEntries(profileNames.map((name) => [name, 0]));
    }
    const owner = tx.owner_display_name;
    result[category][owner] = (result[category][owner] ?? 0) + Math.abs(tx.amount);
  }

  return result;
}

export function buildRunningBalanceSeries(
  transactions: DashboardTransaction[],
  monthStart: Date,
  monthEnd: Date
): RunningBalancePoint[] {
  const days: RunningBalancePoint[] = [];
  let cumulativeIncome = 0;
  let cumulativeExpense = 0;

  for (let day = startOfMonth(monthStart); !isAfter(day, monthEnd); day = addDays(day, 1)) {
    const dayKey = format(day, "yyyy-MM-dd");
    const dayTransactions = transactions.filter((tx) => tx.date === dayKey);

    for (const tx of dayTransactions) {
      if (isRealIncome(tx)) cumulativeIncome += tx.amount;
      if (isRealExpense(tx)) cumulativeExpense += Math.abs(tx.amount);
    }

    days.push({
      date: dayKey,
      label: format(day, "d MMM"),
      balance: Math.round((cumulativeIncome - cumulativeExpense) * 100) / 100,
    });
  }

  return days;
}

function getCycleStartDate(reference: Date, salaryDayOfMonth: number): Date {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const day = Math.min(salaryDayOfMonth, getDaysInMonth(reference));

  let cycleStart = new Date(year, month, day);
  if (isAfter(cycleStart, reference)) {
    const prevMonth = new Date(year, month - 1, 1);
    const prevDay = Math.min(salaryDayOfMonth, getDaysInMonth(prevMonth));
    cycleStart = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), prevDay);
  }

  return cycleStart;
}

export function computeDaysToZero(
  account: DashboardAccount,
  transactions: DashboardTransaction[],
  referenceDate: Date = new Date()
): DaysToZeroResult {
  const threshold = account.low_balance_threshold;

  if (!account.salary_day_of_month || account.salary_amount === null) {
    return {
      accountId: account.id,
      accountName: account.name,
      ownerDisplayName: account.owner_display_name,
      configured: false,
      daysIntoCycle: null,
      cycleStartDate: null,
      threshold,
      message: "Set salary day and amount in Settings to enable this projection.",
    };
  }

  const cycleStart = getCycleStartDate(referenceDate, account.salary_day_of_month);
  const cycleStartKey = format(cycleStart, "yyyy-MM-dd");
  let balance = account.salary_amount;

  const accountTransactions = transactions
    .filter((tx) => tx.account_id === account.id)
    .filter((tx) => {
      const txDate = parseISO(tx.date);
      return (
        isEqual(txDate, cycleStart) ||
        (isAfter(txDate, cycleStart) && !isAfter(txDate, referenceDate))
      );
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const dailyNet = new Map<string, number>();
  for (const tx of accountTransactions) {
  if (tx.is_internal_transfer || tx.is_billing_error) continue;
    dailyNet.set(tx.date, (dailyNet.get(tx.date) ?? 0) + tx.amount);
  }

  let daysIntoCycle: number | null = null;
  for (let day = cycleStart; !isAfter(day, referenceDate); day = addDays(day, 1)) {
    const dayKey = format(day, "yyyy-MM-dd");
    balance += dailyNet.get(dayKey) ?? 0;
    balance = Math.round(balance * 100) / 100;

    const dayOffset =
      Math.floor((day.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    if (balance < threshold && daysIntoCycle === null) {
      daysIntoCycle = dayOffset;
    }
  }

  if (daysIntoCycle === null) {
    return {
      accountId: account.id,
      accountName: account.name,
      ownerDisplayName: account.owner_display_name,
      configured: true,
      daysIntoCycle: null,
      cycleStartDate: cycleStartKey,
      threshold,
      message: `Balance stayed above ${threshold} ZAR this cycle.`,
    };
  }

  return {
    accountId: account.id,
    accountName: account.name,
    ownerDisplayName: account.owner_display_name,
    configured: true,
    daysIntoCycle,
    cycleStartDate: cycleStartKey,
    threshold,
    message: `Balance dropped below R ${threshold.toFixed(2)} on day ${daysIntoCycle} of the cycle.`,
  };
}

export function getCurrentMonthRange(referenceDate: Date = new Date()) {
  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);
  return {
    monthStart,
    monthEnd,
    monthLabel: format(monthStart, "MMMM yyyy"),
    monthStartKey: format(monthStart, "yyyy-MM-dd"),
    monthEndKey: format(monthEnd, "yyyy-MM-dd"),
  };
}

export function filterByProfile<T extends { owner_profile_id: string }>(
  items: T[],
  profileId: string | null,
  accountIds?: Set<string>
): T[] {
  if (profileId) {
    return items.filter((item) => item.owner_profile_id === profileId);
  }
  if (accountIds) {
    return items.filter((item) => "account_id" in item && accountIds.has((item as { account_id: string }).account_id));
  }
  return items;
}

export function filterTransactionsByScope(
  transactions: DashboardTransaction[],
  profileId: string | null
): DashboardTransaction[] {
  if (!profileId) return transactions;
  return transactions.filter((tx) => tx.owner_profile_id === profileId);
}

export function filterAccountsByScope(
  accounts: DashboardAccount[],
  profileId: string | null
): DashboardAccount[] {
  if (!profileId) return accounts;
  return accounts.filter((account) => account.owner_profile_id === profileId);
}
