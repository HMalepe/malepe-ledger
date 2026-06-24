"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Upload } from "lucide-react";

import type {
  AccountWithOwner,
  BankProfile,
  Category,
  TransactionFilters,
  TransactionRow,
} from "@/lib/transactions/types";
import { ImportDialog } from "@/components/transactions/import-dialog";
import { TransactionFormDialog } from "@/components/transactions/transaction-form-dialog";
import {
  TransactionFiltersBar,
  filterTransactions,
} from "@/components/transactions/transaction-filters";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { Button } from "@/components/ui/button";

type TransactionsPageClientProps = {
  initialTransactions: TransactionRow[];
  accounts: AccountWithOwner[];
  categories: Category[];
  profiles: { id: string; display_name: string }[];
  bankProfiles: BankProfile[];
  monthLabel: string;
  initialFilters: TransactionFilters;
};

export function TransactionsPageClient({
  initialTransactions,
  accounts,
  categories: initialCategories,
  profiles,
  bankProfiles,
  monthLabel,
  initialFilters,
}: TransactionsPageClientProps) {
  const [categories, setCategories] = useState(initialCategories);
  const [filters, setFilters] = useState<TransactionFilters>(initialFilters);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<TransactionRow | null>(null);

  useEffect(() => {
    setCategories(initialCategories);
    setFilters(initialFilters);
  }, [initialCategories, initialFilters]);

  const filteredTransactions = useMemo(
    () => filterTransactions(initialTransactions, filters, accounts),
    [initialTransactions, filters, accounts]
  );

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {filteredTransactions.length} transaction
            {filteredTransactions.length === 1 ? "" : "s"} in {monthLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setIsImportOpen(true)}>
            <Upload />
            Import CSV
          </Button>
          <Button onClick={() => setIsAddOpen(true)}>
            <Plus />
            Add transaction
          </Button>
        </div>
      </div>

      <TransactionFiltersBar
        accounts={accounts}
        categories={categories}
        profiles={profiles}
        filters={filters}
        onChange={setFilters}
      />

      <TransactionsTable
        transactions={filteredTransactions}
        sortDir={filters.sortDir ?? "desc"}
        onSortDirChange={(sortDir) => setFilters((current) => ({ ...current, sortDir }))}
        onEdit={(transaction) => setEditingTransaction(transaction)}
      />

      <TransactionFormDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        accounts={accounts}
        categories={categories}
        onCategoriesChange={setCategories}
      />

      <TransactionFormDialog
        open={Boolean(editingTransaction)}
        onOpenChange={(open) => {
          if (!open) setEditingTransaction(null);
        }}
        accounts={accounts}
        categories={categories}
        transaction={editingTransaction}
        onCategoriesChange={setCategories}
      />

      <ImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        accounts={accounts}
        bankProfiles={bankProfiles}
      />
    </div>
  );
}
