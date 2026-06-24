"use server";

import { revalidatePath } from "next/cache";

import {
  parseImportRows,
  reconcileImport,
  detectBankProfile,
  inferTxType,
} from "@/lib/import/csv";
import { computeTransactionRowHash } from "@/lib/transactions/hash";
import {
  parseAmountInput,
  signedAmountFromInput,
} from "@/lib/transactions/currency";
import type {
  AccountWithOwner,
  BankProfile,
  Category,
  ImportPreview,
  TransactionFilters,
  TransactionFormValues,
  TransactionRow,
  TxType,
} from "@/lib/transactions/types";
import { createClient } from "@/lib/supabase/server";
import { learnMerchantCategoryMapping } from "@/lib/categories/suggest";
import { assertAccountBelongsToHousehold } from "@/lib/household/membership";
import {
  getHouseholdViewingMonth,
  monthRangeFromViewingMonth,
} from "@/lib/household/viewing-month";

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

function revalidateTransactionPaths() {
  revalidatePath("/transactions", "layout");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/insights", "layout");
}

export async function getTransactionPageData(filters: TransactionFilters = {}) {
  const { supabase, profile } = await getHouseholdContext();
  const viewing = await getHouseholdViewingMonth(supabase, profile.household_id);
  const range = monthRangeFromViewingMonth(viewing.month);

  const effectiveFilters: TransactionFilters = { ...filters };
  if (!effectiveFilters.dateFrom && !effectiveFilters.dateTo) {
    effectiveFilters.dateFrom = range.monthStartKey;
    effectiveFilters.dateTo = range.monthEndKey;
  }

  let query = supabase
    .from("transactions")
    .select(
      `
      id,
      household_id,
      account_id,
      date,
      description,
      reference,
      category,
      amount,
      is_debit,
      tx_type,
      is_internal_transfer,
      is_billing_error,
      billing_error_status,
      notes,
      created_at,
      deleted_at,
      accounts!inner (
        name,
        owner_profile_id,
        profiles!accounts_owner_profile_id_fkey (
          display_name
        )
      )
    `
    )
    .eq("household_id", profile.household_id)
    .is("deleted_at", null)
    .order("date", { ascending: effectiveFilters.sortDir !== "desc" });

  if (effectiveFilters.accountId) {
    query = query.eq("account_id", effectiveFilters.accountId);
  }
  if (effectiveFilters.category) {
    query = query.eq("category", effectiveFilters.category);
  }
  if (effectiveFilters.dateFrom) {
    query = query.gte("date", effectiveFilters.dateFrom);
  }
  if (effectiveFilters.dateTo) {
    query = query.lte("date", effectiveFilters.dateTo);
  }

  const { data: transactions, error: txError } = await query;
  if (txError) throw new Error(txError.message);

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select(
      `
      id,
      name,
      institution,
      account_type,
      owner_profile_id,
      profiles!accounts_owner_profile_id_fkey (
        display_name
      )
    `
    )
    .eq("household_id", profile.household_id)
    .order("name");

  if (accountsError) throw new Error(accountsError.message);

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

  const { data: bankProfiles, error: bankProfilesError } = await supabase
    .from("bank_profiles")
    .select("*")
    .or(`household_id.is.null,household_id.eq.${profile.household_id}`)
    .order("institution");

  if (bankProfilesError) throw new Error(bankProfilesError.message);

  const accountRows: AccountWithOwner[] = (accounts ?? []).map((account) => {
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
    };
  });

  let transactionRows: TransactionRow[] = (transactions ?? []).map((tx) => {
    const account = Array.isArray(tx.accounts) ? tx.accounts[0] : tx.accounts;
    const owner = account?.profiles
      ? Array.isArray(account.profiles)
        ? account.profiles[0]
        : account.profiles
      : null;

    return {
      id: tx.id,
      household_id: tx.household_id,
      account_id: tx.account_id,
      account_name: account?.name ?? "Unknown",
      owner_display_name: owner?.display_name ?? "Unknown",
      date: tx.date,
      description: tx.description,
      reference: tx.reference,
      category: tx.category,
      amount: Number(tx.amount),
      is_debit: tx.is_debit,
      tx_type: tx.tx_type as TxType,
      is_internal_transfer: tx.is_internal_transfer,
      is_billing_error: tx.is_billing_error,
      billing_error_status: tx.billing_error_status,
      notes: tx.notes,
      created_at: tx.created_at,
      deleted_at: tx.deleted_at,
    };
  });

  if (effectiveFilters.profileId) {
    const accountIds = new Set(
      accountRows
        .filter((account) => account.owner_profile_id === effectiveFilters.profileId)
        .map((account) => account.id)
    );
    transactionRows = transactionRows.filter((tx) =>
      accountIds.has(tx.account_id)
    );
  }

  return {
    transactions: transactionRows,
    accounts: accountRows,
    categories: (categories ?? []) as Category[],
    profiles: profiles ?? [],
    bankProfiles: (bankProfiles ?? []) as BankProfile[],
    monthKey: viewing.monthKey,
    monthLabel: range.monthLabel,
    defaultFilters: effectiveFilters,
  };
}

function buildTransactionPayload(
  values: TransactionFormValues,
  householdId: string,
  userId: string,
  internalDirection?: "out" | "in"
) {
  const absoluteAmount = parseAmountInput(values.amount);
  const txType = values.tx_type;
  let signed = signedAmountFromInput(absoluteAmount, txType);

  if (txType === "internal_transfer" && internalDirection) {
    signed = {
      amount:
        internalDirection === "out"
          ? -Math.abs(absoluteAmount)
          : Math.abs(absoluteAmount),
      is_debit: internalDirection === "out",
    };
  }

  const rowHash = computeTransactionRowHash({
    date: values.date,
    description: values.description,
    amount: signed.amount,
    accountId: values.account_id,
  });

  return {
    household_id: householdId,
    account_id: values.account_id,
    date: values.date,
    description: values.description.trim(),
    reference: values.reference.trim() || null,
    category: values.category.trim() || null,
    amount: signed.amount,
    is_debit: signed.is_debit,
    currency: "ZAR",
    tx_type: txType,
    is_internal_transfer: txType === "internal_transfer",
    is_billing_error: values.is_billing_error,
    billing_error_status: values.is_billing_error
      ? values.billing_error_status || "flagged"
      : null,
    notes: values.notes.trim() || null,
    created_by: userId,
    row_hash: rowHash,
  };
}

export async function createTransaction(
  values: TransactionFormValues,
  internalDirection?: "out" | "in"
): Promise<ActionResult<TransactionRow>> {
  try {
    const { supabase, user, profile } = await getHouseholdContext();
    await assertAccountBelongsToHousehold(
      supabase,
      values.account_id,
      profile.household_id
    );
    const payload = buildTransactionPayload(
      values,
      profile.household_id,
      user.id,
      internalDirection
    );

    const { data, error } = await supabase
      .from("transactions")
      .insert(payload)
      .select(
        `
        id,
        household_id,
        account_id,
        date,
        description,
        reference,
        category,
        amount,
        is_debit,
        tx_type,
        is_internal_transfer,
        is_billing_error,
        billing_error_status,
        notes,
        created_at,
        deleted_at,
        accounts!inner (
          name,
          profiles!accounts_owner_profile_id_fkey (display_name)
        )
      `
      )
      .single();

    if (error) return { success: false, error: error.message };

    if (values.category.trim()) {
      await learnMerchantCategoryMapping(
        supabase,
        profile.household_id,
        values.description,
        values.category.trim()
      );
    }

    const account = Array.isArray(data.accounts) ? data.accounts[0] : data.accounts;
    const owner = account?.profiles
      ? Array.isArray(account.profiles)
        ? account.profiles[0]
        : account.profiles
      : null;

    revalidateTransactionPaths();
    return {
      success: true,
      data: {
        id: data.id,
        household_id: data.household_id,
        account_id: data.account_id,
        account_name: account?.name ?? "Unknown",
        owner_display_name: owner?.display_name ?? "Unknown",
        date: data.date,
        description: data.description,
        reference: data.reference,
        category: data.category,
        amount: Number(data.amount),
        is_debit: data.is_debit,
        tx_type: data.tx_type,
        is_internal_transfer: data.is_internal_transfer,
        is_billing_error: data.is_billing_error,
        billing_error_status: data.billing_error_status,
        notes: data.notes,
        created_at: data.created_at,
        deleted_at: data.deleted_at,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create transaction",
    };
  }
}

export async function updateTransaction(
  id: string,
  values: TransactionFormValues,
  internalDirection?: "out" | "in"
): Promise<ActionResult<null>> {
  try {
    const { supabase, user, profile } = await getHouseholdContext();
    await assertAccountBelongsToHousehold(
      supabase,
      values.account_id,
      profile.household_id
    );
    const payload = buildTransactionPayload(
      values,
      profile.household_id,
      user.id,
      internalDirection
    );

    const { error } = await supabase
      .from("transactions")
      .update({
        account_id: payload.account_id,
        date: payload.date,
        description: payload.description,
        reference: payload.reference,
        category: payload.category,
        amount: payload.amount,
        is_debit: payload.is_debit,
        tx_type: payload.tx_type,
        is_internal_transfer: payload.is_internal_transfer,
        is_billing_error: payload.is_billing_error,
        billing_error_status: payload.billing_error_status,
        notes: payload.notes,
        row_hash: payload.row_hash,
      })
      .eq("id", id)
      .eq("household_id", profile.household_id)
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    if (values.category.trim()) {
      await learnMerchantCategoryMapping(
        supabase,
        profile.household_id,
        values.description,
        values.category.trim()
      );
    }

    revalidateTransactionPaths();
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update transaction",
    };
  }
}

export async function softDeleteTransaction(
  id: string
): Promise<ActionResult<null>> {
  try {
    const { supabase, profile } = await getHouseholdContext();

    const { error } = await supabase
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("household_id", profile.household_id)
      .is("deleted_at", null);

    if (error) return { success: false, error: error.message };

    revalidateTransactionPaths();
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete transaction",
    };
  }
}

export async function createCategory(
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

    revalidateTransactionPaths();
    revalidatePath("/settings");
    return { success: true, data: data as Category };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create category",
    };
  }
}

export async function previewCsvImport(input: {
  csvText: string;
  accountId: string;
  profileId?: string;
  openingBalance?: string;
  closingBalance?: string;
}): Promise<ActionResult<ImportPreview>> {
  try {
    const { supabase } = await getHouseholdContext();

    const pageData = await getTransactionPageData();
    const account = pageData.accounts.find((item) => item.id === input.accountId);
    if (!account) {
      return { success: false, error: "Account not found" };
    }

    const institutionProfiles = pageData.bankProfiles.filter(
      (item) =>
        item.institution.toLowerCase() === account.institution.toLowerCase()
    );

    const { headers } = await import("@/lib/import/csv").then((mod) =>
      mod.parseCsv(input.csvText)
    );

    const selectedProfile =
      (input.profileId
        ? pageData.bankProfiles.find((item) => item.id === input.profileId)
        : null) ??
      detectBankProfile(headers, institutionProfiles) ??
      detectBankProfile(headers, pageData.bankProfiles);

    if (!selectedProfile) {
      return {
        success: false,
        error:
          "Could not detect a bank column mapping. Select a profile manually.",
      };
    }

    const { data: existingRows, error: existingError } = await supabase
      .from("transactions")
      .select("row_hash")
      .eq("account_id", input.accountId)
      .is("deleted_at", null)
      .not("row_hash", "is", null);

    if (existingError) {
      return { success: false, error: existingError.message };
    }

    const existingHashes = new Set(
      (existingRows ?? [])
        .map((row) => row.row_hash)
        .filter((hash): hash is string => Boolean(hash))
    );

    const parsed = parseImportRows({
      csvText: input.csvText,
      accountId: input.accountId,
      profile: selectedProfile,
      existingHashes,
    });

    const openingBalance =
      input.openingBalance !== undefined && input.openingBalance !== ""
        ? parseAmountInput(input.openingBalance)
        : parsed.openingBalance;
    const closingBalance =
      input.closingBalance !== undefined && input.closingBalance !== ""
        ? parseAmountInput(input.closingBalance)
        : parsed.closingBalance;

    const reconciliation = reconcileImport({
      openingBalance,
      closingBalance,
      rows: parsed.rows,
    });

    return {
      success: true,
      data: {
        rows: parsed.rows,
        duplicateCount: parsed.duplicateCount,
        openingBalance,
        closingBalance,
        calculatedClosingBalance: reconciliation.calculatedClosingBalance,
        reconciliationOk: reconciliation.reconciliationOk,
        reconciliationDiff: reconciliation.reconciliationDiff,
        detectedProfile: selectedProfile,
        headers: parsed.headers,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to preview import",
    };
  }
}

export async function commitCsvImport(input: {
  csvText: string;
  accountId: string;
  filename: string;
  profileId: string;
  openingBalance?: string;
  closingBalance?: string;
  acknowledgeReconciliationWarning?: boolean;
}): Promise<
  ActionResult<{
    importedCount: number;
    duplicateCount: number;
    batchId: string;
    batchStatus: string;
  }>
> {
  try {
    const { supabase, user, profile } = await getHouseholdContext();
    await assertAccountBelongsToHousehold(
      supabase,
      input.accountId,
      profile.household_id
    );

    const previewResult = await previewCsvImport({
      csvText: input.csvText,
      accountId: input.accountId,
      profileId: input.profileId,
      openingBalance: input.openingBalance,
      closingBalance: input.closingBalance,
    });

    if (!previewResult.success) {
      return previewResult;
    }

    const preview = previewResult.data;

    if (
      preview.openingBalance !== null &&
      preview.closingBalance !== null &&
      !preview.reconciliationOk &&
      !input.acknowledgeReconciliationWarning
    ) {
      return {
        success: false,
        error:
          "Reconciliation failed. Review the warning and confirm before committing.",
      };
    }

    const batchStatus =
      preview.openingBalance !== null &&
      preview.closingBalance !== null &&
      !preview.reconciliationOk
        ? "flagged"
        : preview.openingBalance !== null && preview.closingBalance !== null
          ? "reconciled"
          : "committed";

    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .insert({
        household_id: profile.household_id,
        account_id: input.accountId,
        filename: input.filename,
        uploaded_by: user.id,
        status: batchStatus,
        currency: "ZAR",
        opening_balance: preview.openingBalance,
        closing_balance: preview.closingBalance,
        calculated_closing_balance: preview.calculatedClosingBalance,
      })
      .select("id, status")
      .single();

    if (batchError) return { success: false, error: batchError.message };

    const rowsToInsert = preview.rows
      .filter((row) => !row.isDuplicate)
      .map((row) => ({
        household_id: profile.household_id,
        account_id: input.accountId,
        import_batch_id: batch.id,
        date: row.date,
        description: row.description,
        reference: row.reference,
        category: null,
        amount: row.amount,
        is_debit: row.is_debit,
        currency: "ZAR",
        tx_type: inferTxType(row.amount),
        is_internal_transfer: false,
        created_by: user.id,
        row_hash: row.row_hash,
      }));

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("transactions")
        .insert(rowsToInsert);

      if (insertError) {
        await supabase.from("import_batches").delete().eq("id", batch.id);
        return { success: false, error: insertError.message };
      }
    }

    revalidateTransactionPaths();
    return {
      success: true,
      data: {
        importedCount: rowsToInsert.length,
        duplicateCount: preview.duplicateCount,
        batchId: batch.id,
        batchStatus: batch.status,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to commit import",
    };
  }
}