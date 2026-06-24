"use client";

import { useMemo } from "react";
import { format } from "date-fns";

import type {
  AccountWithOwner,
  Category,
  TransactionFilters,
  TransactionRow,
} from "@/lib/transactions/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TransactionFiltersBarProps = {
  accounts: AccountWithOwner[];
  categories: Category[];
  profiles: { id: string; display_name: string }[];
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
};

export function TransactionFiltersBar({
  accounts,
  categories,
  profiles,
  filters,
  onChange,
}: TransactionFiltersBarProps) {
  const categoryOptions = useMemo(() => {
    const fromDb = categories.map((category) => category.name);
    return Array.from(new Set(fromDb)).sort();
  }, [categories]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Date filters narrow within the household viewing month. Use the month
        selector in the header to change periods.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <div className="space-y-1.5">
        <Label htmlFor="filter-account">Account</Label>
        <Select
          value={filters.accountId ?? "all"}
          onValueChange={(value) =>
            onChange({
              ...filters,
              accountId: !value || value === "all" ? undefined : value,
            })
          }
        >
          <SelectTrigger id="filter-account" className="w-full">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-person">Person</Label>
        <Select
          value={filters.profileId ?? "all"}
          onValueChange={(value) =>
            onChange({
              ...filters,
              profileId: !value || value === "all" ? undefined : value,
            })
          }
        >
          <SelectTrigger id="filter-person" className="w-full">
            <SelectValue placeholder="All people" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All people</SelectItem>
            {profiles.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-category">Category</Label>
        <Select
          value={filters.category ?? "all"}
          onValueChange={(value) =>
            onChange({
              ...filters,
              category: !value || value === "all" ? undefined : value,
            })
          }
        >
          <SelectTrigger id="filter-category" className="w-full">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categoryOptions.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-from">From</Label>
        <Input
          id="filter-from"
          type="date"
          value={filters.dateFrom ?? ""}
          onChange={(event) =>
            onChange({
              ...filters,
              dateFrom: event.target.value || undefined,
            })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-to">To</Label>
        <Input
          id="filter-to"
          type="date"
          value={filters.dateTo ?? ""}
          onChange={(event) =>
            onChange({
              ...filters,
              dateTo: event.target.value || undefined,
            })
          }
        />
      </div>
      </div>
    </div>
  );
}

export function filterTransactions(
  transactions: TransactionRow[],
  filters: TransactionFilters,
  accounts: AccountWithOwner[]
): TransactionRow[] {
  let rows = [...transactions];

  if (filters.accountId) {
    rows = rows.filter((row) => row.account_id === filters.accountId);
  }

  if (filters.profileId) {
    const accountIds = new Set(
      accounts
        .filter((account) => account.owner_profile_id === filters.profileId)
        .map((account) => account.id)
    );
    rows = rows.filter((row) => accountIds.has(row.account_id));
  }

  if (filters.category) {
    rows = rows.filter((row) => row.category === filters.category);
  }

  if (filters.dateFrom) {
    rows = rows.filter((row) => row.date >= filters.dateFrom!);
  }

  if (filters.dateTo) {
    rows = rows.filter((row) => row.date <= filters.dateTo!);
  }

  rows.sort((a, b) => {
    const comparison = a.date.localeCompare(b.date);
    return filters.sortDir === "asc" ? comparison : -comparison;
  });

  return rows;
}

export function formatTransactionDate(date: string): string {
  return format(new Date(`${date}T00:00:00`), "dd MMM yyyy");
}
