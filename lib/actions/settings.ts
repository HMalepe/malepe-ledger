"use server";

import { revalidatePath } from "next/cache";

import {
  buildMonthCsv,
  buildMonthPrintHtml,
  type ExportTransactionRow,
} from "@/lib/export/month-report";
import {
  getHouseholdViewingMonth,
  monthRangeFromViewingMonth,
  setHouseholdViewingMonth,
} from "@/lib/household/viewing-month";
import type {
  AccountFormValues,
  SettingsAccount,
  SettingsPageData,
} from "@/lib/settings/types";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/transactions/types";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

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

  return { supabase, user, profile };
}

function revalidatePeriodPaths() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/transactions", "layout");
  revalidatePath("/insights", "layout");
  revalidatePath("/settings", "layout");
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function accountPayload(values: AccountFormValues, householdId: string) {
  const threshold = parseOptionalAmount(values.low_balance_threshold);
  return {
    household_id: householdId,
    name: values.name.trim(),
    institution: values.institution.trim(),
    account_type: values.account_type,
    owner_profile_id: values.owner_profile_id,
    salary_day_of_month: parseOptionalInt(values.salary_day_of_month),
    salary_amount: parseOptionalAmount(values.salary_amount),
    low_balance_threshold: threshold ?? 200,
  };
}

export async function getViewingMonthContext() {
  const { supabase, profile } = await getHouseholdContext();
  return getHouseholdViewingMonth(supabase, profile.household_id);
}

export async function getSettingsPageData(): Promise<SettingsPageData> {
  const { supabase, profile } = await getHouseholdContext();
  const viewing = await getHouseholdViewingMonth(supabase, profile.household_id);

  const { data: accountsRaw, error: accountsError } = await supabase
    .from("accounts")
    .select(
      `
      id,
      name,
      institution,
      account_type,
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

  const accountIds = (accountsRaw ?? []).map((account) => account.id);
  const txCounts = new Map<string, number>();

  if (accountIds.length > 0) {
    const { data: txRows, error: txError } = await supabase
      .from("transactions")
      .select("account_id")
      .eq("household_id", profile.household_id)
      .is("deleted_at", null)
      .in("account_id", accountIds);

    if (txError) throw new Error(txError.message);

    for (const row of txRows ?? []) {
      txCounts.set(row.account_id, (txCounts.get(row.account_id) ?? 0) + 1);
    }
  }

  const accounts: SettingsAccount[] = (accountsRaw ?? []).map((account) => {
    const owner = Array.isArray(account.profiles)
      ? account.profiles[0]
      : account.profiles;

    return {
      id: account.id,
      name: account.name,
      institution: account.institution,
      account_type: account.account_type,
      owner_profile_id: account.owner_profile_id,
      owner_display_name: owner?.display_name ?? "Unknown",
      salary_day_of_month: account.salary_day_of_month,
      salary_amount:
        account.salary_amount === null ? null : Number(account.salary_amount),
      low_balance_threshold: Number(account.low_balance_threshold ?? 200),
      transaction_count: txCounts.get(account.id) ?? 0,
    };
  });

  const { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select("id, name, scope")
    .eq("household_id", profile.household_id)
    .order("name");

  if (categoriesError) throw new Error(categoriesError.message);

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("household_id", profile.household_id)
    .order("display_name");

  if (profilesError) throw new Error(profilesError.message);

  return {
    monthKey: viewing.monthKey,
    monthLabel: viewing.monthLabel,
    accounts,
    categories: (categories ?? []) as Category[],
    profiles: profiles ?? [],
  };
}

export async function setViewingMonth(
  monthKey: string
): Promise<ActionResult<{ monthKey: string }>> {
  try {
    const { supabase, profile } = await getHouseholdContext();
    const normalized = await setHouseholdViewingMonth(
      supabase,
      profile.household_id,
      monthKey
    );
    revalidatePeriodPaths();
    return { success: true, data: { monthKey: normalized } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update viewing month",
    };
  }
}

export async function createAccount(
  values: AccountFormValues
): Promise<ActionResult<SettingsAccount>> {
  try {
    const { supabase, profile } = await getHouseholdContext();

    if (!values.name.trim() || !values.institution.trim() || !values.owner_profile_id) {
      return { success: false, error: "Name, institution, and owner are required" };
    }

    const { data, error } = await supabase
      .from("accounts")
      .insert(accountPayload(values, profile.household_id))
      .select(
        `
        id,
        name,
        institution,
        account_type,
        owner_profile_id,
        salary_day_of_month,
        salary_amount,
        low_balance_threshold,
        profiles!accounts_owner_profile_id_fkey (display_name)
      `
      )
      .single();

    if (error) return { success: false, error: error.message };

    const owner = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;

    revalidatePath("/settings");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");

    return {
      success: true,
      data: {
        id: data.id,
        name: data.name,
        institution: data.institution,
        account_type: data.account_type,
        owner_profile_id: data.owner_profile_id,
        owner_display_name: owner?.display_name ?? "Unknown",
        salary_day_of_month: data.salary_day_of_month,
        salary_amount:
          data.salary_amount === null ? null : Number(data.salary_amount),
        low_balance_threshold: Number(data.low_balance_threshold ?? 200),
        transaction_count: 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create account",
    };
  }
}

export async function updateAccount(
  accountId: string,
  values: AccountFormValues
): Promise<ActionResult<null>> {
  try {
    const { supabase, profile } = await getHouseholdContext();

    if (!values.name.trim() || !values.institution.trim() || !values.owner_profile_id) {
      return { success: false, error: "Name, institution, and owner are required" };
    }

    const { error } = await supabase
      .from("accounts")
      .update(accountPayload(values, profile.household_id))
      .eq("id", accountId)
      .eq("household_id", profile.household_id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/settings");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update account",
    };
  }
}

export async function deleteAccount(
  accountId: string
): Promise<ActionResult<null>> {
  try {
    const { supabase, profile } = await getHouseholdContext();

    const { count, error: countError } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("household_id", profile.household_id)
      .is("deleted_at", null);

    if (countError) return { success: false, error: countError.message };
    if ((count ?? 0) > 0) {
      return {
        success: false,
        error: "Cannot delete an account that has transactions. Reassign or remove them first.",
      };
    }

    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("id", accountId)
      .eq("household_id", profile.household_id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/settings");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete account",
    };
  }
}

export async function createHouseholdCategory(
  name: string,
  scope: "shared" | "individual" = "shared"
): Promise<ActionResult<Category>> {
  try {
    const { supabase, profile } = await getHouseholdContext();

    const { data, error } = await supabase
      .from("categories")
      .insert({
        household_id: profile.household_id,
        name: name.trim(),
        scope,
      })
      .select("id, name, scope")
      .single();

    if (error) return { success: false, error: error.message };

    revalidatePath("/settings");
    revalidatePath("/transactions");
    return { success: true, data: data as Category };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create category",
    };
  }
}

export async function updateHouseholdCategory(
  categoryId: string,
  name: string,
  scope: "shared" | "individual"
): Promise<ActionResult<null>> {
  try {
    const { supabase, profile } = await getHouseholdContext();

    const { error } = await supabase
      .from("categories")
      .update({ name: name.trim(), scope })
      .eq("id", categoryId)
      .eq("household_id", profile.household_id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/settings");
    revalidatePath("/transactions");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update category",
    };
  }
}

export async function deleteHouseholdCategory(
  categoryId: string
): Promise<ActionResult<null>> {
  try {
    const { supabase, profile } = await getHouseholdContext();

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", categoryId)
      .eq("household_id", profile.household_id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/settings");
    revalidatePath("/transactions");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete category",
    };
  }
}

async function fetchExportTransactions(
  householdId: string,
  monthStartKey: string,
  monthEndKey: string
): Promise<ExportTransactionRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("transactions")
    .select(
      `
      date,
      description,
      reference,
      category,
      amount,
      tx_type,
      accounts!inner (
        name,
        profiles!accounts_owner_profile_id_fkey (display_name)
      )
    `
    )
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .gte("date", monthStartKey)
    .lte("date", monthEndKey)
    .order("date", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((tx) => {
    const account = Array.isArray(tx.accounts) ? tx.accounts[0] : tx.accounts;
    const owner = account?.profiles
      ? Array.isArray(account.profiles)
        ? account.profiles[0]
        : account.profiles
      : null;

    return {
      date: tx.date,
      description: tx.description,
      reference: tx.reference,
      account_name: account?.name ?? "Unknown",
      owner_display_name: owner?.display_name ?? "Unknown",
      category: tx.category,
      amount: Number(tx.amount),
      tx_type: tx.tx_type,
    };
  });
}

export async function exportViewingMonthCsv(): Promise<
  ActionResult<{ filename: string; content: string }>
> {
  try {
    const { supabase, profile } = await getHouseholdContext();
    const viewing = await getHouseholdViewingMonth(supabase, profile.household_id);
    const range = monthRangeFromViewingMonth(viewing.month);
    const transactions = await fetchExportTransactions(
      profile.household_id,
      range.monthStartKey,
      range.monthEndKey
    );

    const content = buildMonthCsv(range.monthLabel, transactions);
    const filename = `malepe-ledger-${range.monthStartKey}.csv`;

    return { success: true, data: { filename, content } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to export CSV",
    };
  }
}

export async function exportViewingMonthPdf(): Promise<
  ActionResult<{ html: string; monthLabel: string }>
> {
  try {
    const { supabase, profile } = await getHouseholdContext();
    const viewing = await getHouseholdViewingMonth(supabase, profile.household_id);
    const range = monthRangeFromViewingMonth(viewing.month);
    const transactions = await fetchExportTransactions(
      profile.household_id,
      range.monthStartKey,
      range.monthEndKey
    );

    return {
      success: true,
      data: {
        html: buildMonthPrintHtml(range.monthLabel, transactions),
        monthLabel: range.monthLabel,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to export PDF",
    };
  }
}
