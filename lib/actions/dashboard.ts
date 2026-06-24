"use server";

import {
  buildCategoryComparison,
  buildRunningBalanceSeries,
  computeDaysToZero,
  computeStats,
  filterAccountsByScope,
  filterTransactionsByScope,
} from "@/lib/dashboard/calculations";
import type {
  CategorySpendRow,
  DashboardAccount,
  DashboardData,
  DashboardDebt,
  DashboardProfile,
  DashboardTransaction,
} from "@/lib/dashboard/types";
import { createClient } from "@/lib/supabase/server";
import {
  getHouseholdViewingMonth,
  monthRangeFromViewingMonth,
} from "@/lib/household/viewing-month";
import { fetchPassThroughTransactionIds } from "@/lib/transactions/exclusions";

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

export async function getDashboardData(
  profileId: string | null = null
): Promise<DashboardData> {
  const { supabase, profile } = await getHouseholdContext();
  const viewing = await getHouseholdViewingMonth(supabase, profile.household_id);
  const { monthStart, monthEnd, monthLabel, monthStartKey, monthEndKey } =
    monthRangeFromViewingMonth(viewing.month);

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("household_id", profile.household_id)
    .order("display_name");

  if (profilesError) throw new Error(profilesError.message);

  if (profileId) {
    const exists = (profiles ?? []).some((item) => item.id === profileId);
    if (!exists) {
      throw new Error("Profile not found in household");
    }
  }

  const { data: accountsRaw, error: accountsError } = await supabase
    .from("accounts")
    .select(
      `
      id,
      name,
      owner_profile_id,
      salary_day_of_month,
      salary_amount,
      low_balance_threshold,
      profiles!accounts_owner_profile_id_fkey (display_name)
    `
    )
    .eq("household_id", profile.household_id)
    .order("name");

  if (accountsError) throw new Error(accountsError.message);

  const accounts: DashboardAccount[] = (accountsRaw ?? []).map((account) => {
    const owner = Array.isArray(account.profiles)
      ? account.profiles[0]
      : account.profiles;
    return {
      id: account.id,
      name: account.name,
      owner_profile_id: account.owner_profile_id,
      owner_display_name: owner?.display_name ?? "Unknown",
      salary_day_of_month: account.salary_day_of_month,
      salary_amount:
        account.salary_amount === null ? null : Number(account.salary_amount),
      low_balance_threshold: Number(account.low_balance_threshold ?? 200),
    };
  });

  const scopedAccountIds = new Set(
    filterAccountsByScope(accounts, profileId).map((account) => account.id)
  );

  const { data: transactionsRaw, error: transactionsError } = await supabase
    .from("transactions")
    .select(
      `
      id,
      account_id,
      date,
      amount,
      tx_type,
      category,
      is_internal_transfer,
      is_billing_error,
      accounts!inner (
        owner_profile_id,
        profiles!accounts_owner_profile_id_fkey (display_name)
      )
    `
    )
    .eq("household_id", profile.household_id)
    .is("deleted_at", null)
    .gte("date", monthStartKey)
    .lte("date", monthEndKey);

  if (transactionsError) throw new Error(transactionsError.message);

  const monthTransactions: DashboardTransaction[] = (transactionsRaw ?? [])
    .map((tx) => {
      const account = Array.isArray(tx.accounts) ? tx.accounts[0] : tx.accounts;
      const owner = account?.profiles
        ? Array.isArray(account.profiles)
          ? account.profiles[0]
          : account.profiles
        : null;
      return {
        id: tx.id,
        account_id: tx.account_id,
        owner_profile_id: account?.owner_profile_id ?? "",
        owner_display_name: owner?.display_name ?? "Unknown",
        date: tx.date,
        amount: Number(tx.amount),
        tx_type: tx.tx_type,
        category: tx.category,
        is_internal_transfer: tx.is_internal_transfer,
        is_billing_error: tx.is_billing_error,
      };
    })
    .filter((tx) => !profileId || scopedAccountIds.has(tx.account_id));

  const cycleStart = new Date();
  cycleStart.setMonth(cycleStart.getMonth() - 2);
  const cycleStartKey = cycleStart.toISOString().slice(0, 10);

  const { data: cycleTransactionsRaw, error: cycleError } = await supabase
    .from("transactions")
    .select(
      `
      id,
      account_id,
      date,
      amount,
      tx_type,
      category,
      is_internal_transfer,
      is_billing_error,
      accounts!inner (
        owner_profile_id,
        profiles!accounts_owner_profile_id_fkey (display_name)
      )
    `
    )
    .eq("household_id", profile.household_id)
    .is("deleted_at", null)
    .gte("date", cycleStartKey);

  if (cycleError) throw new Error(cycleError.message);

  const cycleTransactions: DashboardTransaction[] = (cycleTransactionsRaw ?? [])
    .map((tx) => {
      const account = Array.isArray(tx.accounts) ? tx.accounts[0] : tx.accounts;
      const owner = account?.profiles
        ? Array.isArray(account.profiles)
          ? account.profiles[0]
          : account.profiles
        : null;
      return {
        id: tx.id,
        account_id: tx.account_id,
        owner_profile_id: account?.owner_profile_id ?? "",
        owner_display_name: owner?.display_name ?? "Unknown",
        date: tx.date,
        amount: Number(tx.amount),
        tx_type: tx.tx_type,
        category: tx.category,
        is_internal_transfer: tx.is_internal_transfer,
        is_billing_error: tx.is_billing_error,
      };
    })
    .filter((tx) => !profileId || scopedAccountIds.has(tx.account_id));

  const { data: debtsRaw, error: debtsError } = await supabase
    .from("debts")
    .select(
      `
      id,
      debt_type,
      amount,
      repaid,
      inflow_transaction_id,
      outflow_transaction_id
    `
    )
    .eq("household_id", profile.household_id);

  if (debtsError) throw new Error(debtsError.message);

  const passThroughIds = await fetchPassThroughTransactionIds(
    supabase,
    profile.household_id
  );

  const passThroughIdsForAmounts = (debtsRaw ?? [])
    .filter((debt) => debt.debt_type === "pass_through")
    .flatMap((debt) => [debt.inflow_transaction_id, debt.outflow_transaction_id])
    .filter((id): id is string => Boolean(id));

  let passThroughAmounts = new Map<string, number>();
  if (passThroughIdsForAmounts.length > 0) {
    const { data: linkedTx, error: linkedError } = await supabase
      .from("transactions")
      .select("id, amount")
      .in("id", passThroughIdsForAmounts);

    if (linkedError) throw new Error(linkedError.message);
    passThroughAmounts = new Map(
      (linkedTx ?? []).map((tx) => [tx.id, Number(tx.amount)])
    );
  }

  const debts: DashboardDebt[] = (debtsRaw ?? []).map((debt) => ({
    id: debt.id,
    debt_type: debt.debt_type as "standard" | "pass_through",
    amount: Number(debt.amount),
    repaid: debt.repaid,
    inflow_amount: debt.inflow_transaction_id
      ? passThroughAmounts.get(debt.inflow_transaction_id) ?? null
      : null,
    outflow_amount: debt.outflow_transaction_id
      ? passThroughAmounts.get(debt.outflow_transaction_id) ?? null
      : null,
  }));

  const scopedTransactions = filterTransactionsByScope(monthTransactions, profileId);
  const scopedAccounts = filterAccountsByScope(accounts, profileId);
  const profileList = (profiles ?? []) as DashboardProfile[];
  const profileNames = profileList.map((item) => item.display_name);

  const categoryMap = buildCategoryComparison(
    profileId ? scopedTransactions : monthTransactions,
    profileNames,
    passThroughIds
  );

  const categoryComparison: CategorySpendRow[] = Object.entries(categoryMap)
    .map(([category, values]) => ({
      category,
      ...values,
    }))
    .sort((a, b) => {
      const totalA = profileNames.reduce(
        (sum, name) => sum + Number((a as Record<string, string | number>)[name] ?? 0),
        0
      );
      const totalB = profileNames.reduce(
        (sum, name) => sum + Number((b as Record<string, string | number>)[name] ?? 0),
        0
      );
      return totalB - totalA;
    });

  const stats = computeStats(scopedTransactions, debts, passThroughIds);
  const runningBalance = buildRunningBalanceSeries(
    scopedTransactions,
    monthStart,
    monthEnd,
    passThroughIds
  );

  const daysToZero = scopedAccounts.map((account) =>
    computeDaysToZero(account, cycleTransactions, new Date(), passThroughIds)
  );

  const scopedProfile = profileId
    ? profileList.find((item) => item.id === profileId)
    : null;

  return {
    monthLabel,
    monthStart: monthStartKey,
    monthEnd: monthEndKey,
    profiles: profileList,
    stats,
    categoryComparison,
    runningBalance,
    daysToZero,
    scopeLabel: scopedProfile
      ? `${scopedProfile.display_name}'s view`
      : "Household",
    profileId,
  };
}
