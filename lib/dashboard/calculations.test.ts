import { describe, expect, it } from "vitest";

import {
  computeStats,
  isRealExpense,
  isRealIncome,
} from "@/lib/dashboard/calculations";
import {
  computeHouseholdTotals,
  isExcludedFromHouseholdTotals,
  isRealExpenseTx,
  isRealIncomeTx,
} from "@/lib/transactions/exclusions";
import type { DashboardDebt, DashboardTransaction } from "@/lib/dashboard/types";

const baseTx = (
  overrides: Partial<DashboardTransaction> = {}
): DashboardTransaction => ({
  id: "tx-1",
  account_id: "acc-1",
  owner_profile_id: "profile-1",
  owner_display_name: "Holiday",
  date: "2025-06-01",
  amount: -100,
  tx_type: "expense",
  category: "Groceries",
  is_internal_transfer: false,
  is_billing_error: false,
  ...overrides,
});

const standardDebt: DashboardDebt = {
  id: "debt-1",
  debt_type: "standard",
  amount: 500,
  repaid: false,
  inflow_amount: null,
  outflow_amount: null,
};

describe("transaction exclusions", () => {
  it("excludes internal transfers from real spend", () => {
    const tx = baseTx({ tx_type: "internal_transfer", is_internal_transfer: true });
    expect(isExcludedFromHouseholdTotals(tx)).toBe(true);
    expect(isRealExpenseTx(tx)).toBe(false);
  });

  it("excludes billing errors from real spend", () => {
    const tx = baseTx({ is_billing_error: true });
    expect(isRealExpenseTx(tx)).toBe(false);
  });

  it("excludes pass-through linked transactions", () => {
    const passThroughIds = new Set(["tx-pass"]);
    const tx = baseTx({ id: "tx-pass", amount: -2000 });
    expect(isExcludedFromHouseholdTotals(tx, passThroughIds)).toBe(true);
    expect(isRealExpense(tx, passThroughIds)).toBe(false);
  });

  it("counts ordinary income and expenses", () => {
    const passThroughIds = new Set(["pass"]);
    const transactions = [
      baseTx({ id: "income", tx_type: "income", amount: 1000 }),
      baseTx({ id: "expense", tx_type: "expense", amount: -300 }),
      baseTx({
        id: "transfer",
        tx_type: "internal_transfer",
        is_internal_transfer: true,
        amount: -500,
      }),
      baseTx({ id: "pass", amount: -2000 }),
    ];

    const totals = computeHouseholdTotals(transactions, passThroughIds);
    expect(totals.income).toBe(1000);
    expect(totals.expenses).toBe(300);
    expect(totals.surplus).toBe(700);

    const stats = computeStats(transactions, [standardDebt], passThroughIds);
    expect(stats.totalIncome).toBe(1000);
    expect(stats.totalExpenses).toBe(300);
    expect(stats.surplus).toBe(700);
    expect(stats.moneyOwed).toBe(500);
  });

  it("treats real income correctly", () => {
    const tx = baseTx({ tx_type: "income", amount: 2500 });
    expect(isRealIncome(tx)).toBe(true);
    expect(isRealIncomeTx(tx)).toBe(true);
  });
});
