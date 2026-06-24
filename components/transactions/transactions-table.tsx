"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";

import { softDeleteTransaction } from "@/lib/actions/transactions";
import { formatZar } from "@/lib/transactions/currency";
import type { TransactionRow } from "@/lib/transactions/types";
import { formatTransactionDate } from "@/components/transactions/transaction-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TransactionsTableProps = {
  transactions: TransactionRow[];
  sortDir: "asc" | "desc";
  onSortDirChange: (sortDir: "asc" | "desc") => void;
  onEdit: (transaction: TransactionRow) => void;
};

function typeLabel(txType: TransactionRow["tx_type"]): string {
  return txType.replace("_", " ");
}

export function TransactionsTable({
  transactions,
  sortDir,
  onSortDirChange,
  onEdit,
}: TransactionsTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totals = useMemo(
    () =>
      transactions.reduce(
        (sum, row) => sum + row.amount,
        0
      ),
    [transactions]
  );

  async function handleDelete(id: string) {
    if (!window.confirm("Soft-delete this transaction? It will be hidden from the list but kept in the audit log.")) {
      return;
    }

    setDeletingId(id);
    const result = await softDeleteTransaction(id);
    setDeletingId(null);

    if (!result.success) {
      window.alert(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 h-8"
                  onClick={() =>
                    onSortDirChange(sortDir === "desc" ? "asc" : "desc")
                  }
                >
                  Date
                  {sortDir === "desc" ? (
                    <ArrowDown className="size-4" />
                  ) : (
                    <ArrowUp className="size-4" />
                  )}
                </Button>
              </TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Person</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No transactions match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatTransactionDate(transaction.date)}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div>{transaction.description}</div>
                      {transaction.reference ? (
                        <div className="text-xs text-muted-foreground">
                          Ref: {transaction.reference}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{transaction.account_name}</TableCell>
                  <TableCell>{transaction.owner_display_name}</TableCell>
                  <TableCell>{transaction.category ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">{typeLabel(transaction.tx_type)}</Badge>
                      {transaction.is_internal_transfer ? (
                        <Badge variant="secondary">Internal</Badge>
                      ) : null}
                      {transaction.is_billing_error ? (
                        <Badge variant="destructive">Billing error</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      transaction.amount < 0
                        ? "text-foreground"
                        : "text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {formatZar(transaction.amount)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onEdit(transaction)}
                      >
                        <Pencil className="size-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={deletingId === transaction.id}
                        onClick={() => handleDelete(transaction.id)}
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-end text-sm text-muted-foreground">
        Net of visible rows:{" "}
        <span className="ml-2 font-medium text-foreground">
          {formatZar(totals)}
        </span>
      </div>
    </div>
  );
}
