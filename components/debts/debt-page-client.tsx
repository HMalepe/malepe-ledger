"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Info, Plus } from "lucide-react";

import {
  createPassThroughDebt,
  createStandardDebt,
  setDebtRepaid,
} from "@/lib/actions/debts";
import { formatZar } from "@/lib/transactions/currency";
import type {
  DebtPageData,
  PassThroughDebtRow,
  StandardDebtRow,
} from "@/lib/debts/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type DebtPageClientProps = DebtPageData;

function formatDate(date: string | null): string {
  if (!date) return "—";
  return format(new Date(`${date}T00:00:00`), "dd MMM yyyy");
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return format(new Date(value), "dd MMM yyyy, HH:mm");
}

export function DebtPageClient({
  totalCurrentlyOwed,
  standardDebts,
  passThroughDebts,
  linkableTransactions,
}: DebtPageClientProps) {
  const router = useRouter();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [debtKind, setDebtKind] = useState<"standard" | "pass_through">("standard");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [creditorName, setCreditorName] = useState("");
  const [amount, setAmount] = useState("");
  const [dateBorrowed, setDateBorrowed] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [dateDue, setDateDue] = useState("");
  const [notes, setNotes] = useState("");
  const [inflowId, setInflowId] = useState("");
  const [outflowId, setOutflowId] = useState("");

  function resetForm() {
    setCreditorName("");
    setAmount("");
    setDateBorrowed(new Date().toISOString().slice(0, 10));
    setDateDue("");
    setNotes("");
    setInflowId("");
    setOutflowId("");
    setDebtKind("standard");
    setError(null);
  }

  async function handleToggleRepaid(debtId: string, repaid: boolean) {
    setUpdatingId(debtId);
    const result = await setDebtRepaid(debtId, repaid);
    setUpdatingId(null);
    if (!result.success) {
      window.alert(result.error);
      return;
    }
    router.refresh();
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    const result =
      debtKind === "standard"
        ? await createStandardDebt({
            creditor_name: creditorName,
            amount,
            date_borrowed: dateBorrowed,
            date_due: dateDue,
            notes,
          })
        : await createPassThroughDebt({
            creditor_name: creditorName,
            date_borrowed: dateBorrowed,
            date_due: dateDue,
            notes,
            inflow_transaction_id: inflowId,
            outflow_transaction_id: outflowId,
          });

    setIsLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setIsAddOpen(false);
    resetForm();
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Total currently owed</CardTitle>
          <CardDescription>
            Sum of unrepaid standard debts. Pass-through entries are tracked
            separately and net to ~R 0.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tracking-tight">
            {formatZar(totalCurrentlyOwed)}
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus />
          Log new debt
        </Button>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Money we owe</h2>
          <p className="text-sm text-muted-foreground">
            Standard debts sorted by due date.
          </p>
        </div>
        <StandardDebtsTable
          debts={standardDebts}
          updatingId={updatingId}
          onToggleRepaid={handleToggleRepaid}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">
            Pass-through / self-funding transfers
          </h2>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="About pass-through debts"
                >
                  <Info className="size-4" />
                </button>
              }
            />
            <TooltipContent className="max-w-xs">
              Borrowing money and immediately using it to pay off an existing debt
              (for example, a R15,000 loan used to clear a credit card) does not
              change real spending power. The net effect is ~R 0 and is shown here
              for transparency, not as money currently owed.
            </TooltipContent>
          </Tooltip>
        </div>
        <PassThroughDebtsTable
          debts={passThroughDebts}
          updatingId={updatingId}
          onToggleRepaid={handleToggleRepaid}
        />
      </section>

      <Dialog
        open={isAddOpen}
        onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Log new debt</DialogTitle>
            <DialogDescription>
              Record a standard debt or a pass-through loan linked to transactions.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="debt-kind">Debt type</Label>
              <Select
                value={debtKind}
                onValueChange={(value) => {
                  if (value === "standard" || value === "pass_through") {
                    setDebtKind(value);
                  }
                }}
              >
                <SelectTrigger id="debt-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard debt</SelectItem>
                  <SelectItem value="pass_through">Pass-through transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="creditor">Creditor name</Label>
              <Input
                id="creditor"
                required
                value={creditorName}
                onChange={(event) => setCreditorName(event.target.value)}
              />
            </div>

            {debtKind === "standard" ? (
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (ZAR)</Label>
                <Input
                  id="amount"
                  required
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="borrowed">Date borrowed</Label>
                <Input
                  id="borrowed"
                  type="date"
                  required
                  value={dateBorrowed}
                  onChange={(event) => setDateBorrowed(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due">Due date (optional)</Label>
                <Input
                  id="due"
                  type="date"
                  value={dateDue}
                  onChange={(event) => setDateDue(event.target.value)}
                />
              </div>
            </div>

            {debtKind === "pass_through" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="inflow-tx">Inflow transaction (loan received)</Label>
                  <Select
                    value={inflowId}
                    onValueChange={(value) => setInflowId(value ?? "")}
                  >
                    <SelectTrigger id="inflow-tx" className="w-full">
                      <SelectValue placeholder="Select transaction" />
                    </SelectTrigger>
                    <SelectContent>
                      {linkableTransactions.map((tx) => (
                        <SelectItem key={tx.id} value={tx.id}>
                          {tx.date} · {tx.description} · {formatZar(tx.amount)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="outflow-tx">Outflow transaction (debt paid)</Label>
                  <Select
                    value={outflowId}
                    onValueChange={(value) => setOutflowId(value ?? "")}
                  >
                    <SelectTrigger id="outflow-tx" className="w-full">
                      <SelectValue placeholder="Select transaction" />
                    </SelectTrigger>
                    <SelectContent>
                      {linkableTransactions.map((tx) => (
                        <SelectItem key={tx.id} value={tx.id}>
                          {tx.date} · {tx.description} · {formatZar(tx.amount)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Saving…" : "Save debt"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StandardDebtsTable({
  debts,
  updatingId,
  onToggleRepaid,
}: {
  debts: StandardDebtRow[];
  updatingId: string | null;
  onToggleRepaid: (id: string, repaid: boolean) => void;
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Creditor</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Borrowed</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Repaid</TableHead>
            <TableHead>Repaid at</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {debts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                No standard debts recorded.
              </TableCell>
            </TableRow>
          ) : (
            debts.map((debt) => (
              <TableRow key={debt.id} className={debt.repaid ? "opacity-60" : undefined}>
                <TableCell className="font-medium">{debt.creditor_name}</TableCell>
                <TableCell>{formatZar(debt.amount)}</TableCell>
                <TableCell>{formatDate(debt.date_borrowed)}</TableCell>
                <TableCell>{formatDate(debt.date_due)}</TableCell>
                <TableCell>
                  <Checkbox
                    checked={debt.repaid}
                    disabled={updatingId === debt.id}
                    onCheckedChange={(checked) =>
                      onToggleRepaid(debt.id, checked === true)
                    }
                    aria-label={`Mark ${debt.creditor_name} as repaid`}
                  />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDateTime(debt.repaid_at)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function PassThroughDebtsTable({
  debts,
  updatingId,
  onToggleRepaid,
}: {
  debts: PassThroughDebtRow[];
  updatingId: string | null;
  onToggleRepaid: (id: string, repaid: boolean) => void;
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Creditor</TableHead>
            <TableHead>Inflow</TableHead>
            <TableHead>Outflow</TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1">
                Net effect
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button type="button" aria-label="Net effect explanation">
                        <Info className="size-3.5 text-muted-foreground" />
                      </button>
                    }
                  />
                  <TooltipContent className="max-w-xs">
                    Net = inflow + outflow from linked transactions. Pass-through
                    loans should be ~R 0 because the borrowed money was immediately
                    used to pay debt — no change to real spending power.
                  </TooltipContent>
                </Tooltip>
              </span>
            </TableHead>
            <TableHead>Borrowed</TableHead>
            <TableHead>Repaid</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {debts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                No pass-through transfers recorded.
              </TableCell>
            </TableRow>
          ) : (
            debts.map((debt) => (
              <TableRow key={debt.id} className={debt.repaid ? "opacity-60" : undefined}>
                <TableCell className="font-medium">{debt.creditor_name}</TableCell>
                <TableCell className="text-sm">
                  {debt.inflow
                    ? `${debt.inflow.description} (${formatZar(debt.inflow.amount)})`
                    : "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {debt.outflow
                    ? `${debt.outflow.description} (${formatZar(debt.outflow.amount)})`
                    : "—"}
                </TableCell>
                <TableCell>{formatZar(debt.netEffect)}</TableCell>
                <TableCell>{formatDate(debt.date_borrowed)}</TableCell>
                <TableCell>
                  <Checkbox
                    checked={debt.repaid}
                    disabled={updatingId === debt.id}
                    onCheckedChange={(checked) =>
                      onToggleRepaid(debt.id, checked === true)
                    }
                    aria-label={`Mark ${debt.creditor_name} as repaid`}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
