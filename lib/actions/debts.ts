"use server";

import { revalidatePath } from "next/cache";

import { parseAmountInput } from "@/lib/transactions/currency";
import type {
  CreatePassThroughDebtInput,
  CreateStandardDebtInput,
  DebtPageData,
  LinkedTransaction,
  PassThroughDebtRow,
  StandardDebtRow,
} from "@/lib/debts/types";
import { createClient } from "@/lib/supabase/server";

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

  return { supabase, profile };
}

function sortByDueDate<T extends { date_due: string | null; date_borrowed: string }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    if (!a.date_due && !b.date_due) {
      return b.date_borrowed.localeCompare(a.date_borrowed);
    }
    if (!a.date_due) return 1;
    if (!b.date_due) return -1;
    return a.date_due.localeCompare(b.date_due);
  });
}

export async function getDebtPageData(): Promise<DebtPageData> {
  const { supabase, profile } = await getHouseholdContext();

  const { data: debtsRaw, error: debtsError } = await supabase
    .from("debts")
    .select(
      `
      id,
      creditor_name,
      amount,
      currency,
      date_borrowed,
      date_due,
      repaid,
      repaid_at,
      notes,
      debt_type,
      inflow_transaction_id,
      outflow_transaction_id
    `
    )
    .eq("household_id", profile.household_id)
    .order("date_borrowed", { ascending: false });

  if (debtsError) throw new Error(debtsError.message);

  const linkedIds = (debtsRaw ?? [])
    .flatMap((debt) => [debt.inflow_transaction_id, debt.outflow_transaction_id])
    .filter((id): id is string => Boolean(id));

  const { data: linkedTransactions, error: linkedError } =
    linkedIds.length > 0
      ? await supabase
          .from("transactions")
          .select("id, date, description, amount")
          .in("id", linkedIds)
      : { data: [], error: null };

  if (linkedError) throw new Error(linkedError.message);

  const txMap = new Map(
    (linkedTransactions ?? []).map((tx) => [
      tx.id,
      {
        id: tx.id,
        date: tx.date,
        description: tx.description,
        amount: Number(tx.amount),
      } satisfies LinkedTransaction,
    ])
  );

  const standardDebts: StandardDebtRow[] = sortByDueDate(
    (debtsRaw ?? [])
      .filter((debt) => debt.debt_type === "standard")
      .map((debt) => ({
        id: debt.id,
        creditor_name: debt.creditor_name,
        amount: Number(debt.amount),
        currency: debt.currency,
        date_borrowed: debt.date_borrowed,
        date_due: debt.date_due,
        repaid: debt.repaid,
        repaid_at: debt.repaid_at,
        notes: debt.notes,
      }))
  );

  const passThroughDebts: PassThroughDebtRow[] = (debtsRaw ?? [])
    .filter((debt) => debt.debt_type === "pass_through")
    .map((debt) => {
      const inflow = debt.inflow_transaction_id
        ? txMap.get(debt.inflow_transaction_id) ?? null
        : null;
      const outflow = debt.outflow_transaction_id
        ? txMap.get(debt.outflow_transaction_id) ?? null
        : null;
      const netEffect =
        inflow && outflow ? inflow.amount + outflow.amount : 0;

      return {
        id: debt.id,
        creditor_name: debt.creditor_name,
        amount: Number(debt.amount),
        currency: debt.currency,
        date_borrowed: debt.date_borrowed,
        date_due: debt.date_due,
        repaid: debt.repaid,
        repaid_at: debt.repaid_at,
        notes: debt.notes,
        inflow,
        outflow,
        netEffect: Math.round(netEffect * 100) / 100,
      };
    });

  const totalCurrentlyOwed = standardDebts
    .filter((debt) => !debt.repaid)
    .reduce((sum, debt) => sum + debt.amount, 0);

  const { data: linkableRaw, error: linkableError } = await supabase
    .from("transactions")
    .select("id, date, description, amount, tx_type")
    .eq("household_id", profile.household_id)
    .is("deleted_at", null)
    .in("tx_type", ["debt_in", "debt_out", "income", "expense"])
    .order("date", { ascending: false })
    .limit(100);

  if (linkableError) throw new Error(linkableError.message);

  const linkableTransactions: LinkedTransaction[] = (linkableRaw ?? []).map(
    (tx) => ({
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: Number(tx.amount),
    })
  );

  return {
    totalCurrentlyOwed,
    standardDebts,
    passThroughDebts,
    linkableTransactions,
  };
}

export async function setDebtRepaid(
  debtId: string,
  repaid: boolean
): Promise<ActionResult<null>> {
  try {
    const { supabase, profile } = await getHouseholdContext();

    const { error } = await supabase
      .from("debts")
      .update({
        repaid,
        repaid_at: repaid ? new Date().toISOString() : null,
      })
      .eq("id", debtId)
      .eq("household_id", profile.household_id);

    if (error) return { success: false, error: error.message };

    revalidatePath("/debt", "layout");
    revalidatePath("/dashboard", "layout");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update debt",
    };
  }
}

export async function createStandardDebt(
  input: CreateStandardDebtInput
): Promise<ActionResult<null>> {
  try {
    const { supabase, profile } = await getHouseholdContext();

    const { error } = await supabase.from("debts").insert({
      household_id: profile.household_id,
      creditor_name: input.creditor_name.trim(),
      amount: parseAmountInput(input.amount),
      currency: "ZAR",
      date_borrowed: input.date_borrowed,
      date_due: input.date_due.trim() || null,
      notes: input.notes.trim() || null,
      debt_type: "standard",
    });

    if (error) return { success: false, error: error.message };

    revalidatePath("/debt", "layout");
    revalidatePath("/dashboard", "layout");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create debt",
    };
  }
}

export async function createPassThroughDebt(
  input: CreatePassThroughDebtInput
): Promise<ActionResult<null>> {
  try {
    const { supabase, profile } = await getHouseholdContext();

    if (!input.inflow_transaction_id || !input.outflow_transaction_id) {
      return {
        success: false,
        error: "Pass-through debts require both inflow and outflow transactions.",
      };
    }

    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("id, amount")
      .eq("household_id", profile.household_id)
      .in("id", [input.inflow_transaction_id, input.outflow_transaction_id]);

    if (txError) return { success: false, error: txError.message };
    if ((transactions ?? []).length !== 2) {
      return { success: false, error: "Linked transactions not found." };
    }

    const inflow = transactions?.find((tx) => tx.id === input.inflow_transaction_id);
    const outflow = transactions?.find((tx) => tx.id === input.outflow_transaction_id);
    const grossAmount = Math.max(
      Math.abs(Number(inflow?.amount ?? 0)),
      Math.abs(Number(outflow?.amount ?? 0))
    );

    const { error } = await supabase.from("debts").insert({
      household_id: profile.household_id,
      creditor_name: input.creditor_name.trim(),
      amount: grossAmount,
      currency: "ZAR",
      date_borrowed: input.date_borrowed,
      date_due: input.date_due.trim() || null,
      notes: input.notes.trim() || null,
      debt_type: "pass_through",
      inflow_transaction_id: input.inflow_transaction_id,
      outflow_transaction_id: input.outflow_transaction_id,
    });

    if (error) return { success: false, error: error.message };

    revalidatePath("/debt", "layout");
    revalidatePath("/dashboard", "layout");
    return { success: true, data: null };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create pass-through debt",
    };
  }
}
