"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles } from "lucide-react";

import { suggestTransactionCategory } from "@/lib/actions/category-suggestions";
import type { CategorySuggestion } from "@/lib/categories/types";

import {
  createCategory,
  createTransaction,
  updateTransaction,
} from "@/lib/actions/transactions";
import { transactionToFormValues } from "@/lib/transactions/form";
import type {
  AccountWithOwner,
  Category,
  TransactionFormValues,
  TransactionRow,
  TxType,
} from "@/lib/transactions/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const TX_TYPES: { value: TxType; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "debt_in", label: "Debt in" },
  { value: "debt_out", label: "Debt out" },
  { value: "internal_transfer", label: "Internal transfer" },
];

const emptyValues: TransactionFormValues = {
  date: new Date().toISOString().slice(0, 10),
  description: "",
  reference: "",
  account_id: "",
  category: "",
  amount: "",
  tx_type: "expense",
  notes: "",
  is_billing_error: false,
  billing_error_status: "flagged",
};

type TransactionFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountWithOwner[];
  categories: Category[];
  transaction?: TransactionRow | null;
  onCategoriesChange: (categories: Category[]) => void;
};

export function TransactionFormDialog({
  open,
  onOpenChange,
  accounts,
  categories,
  transaction,
  onCategoriesChange,
}: TransactionFormDialogProps) {
  const router = useRouter();
  const isEditing = Boolean(transaction);
  const [values, setValues] = useState<TransactionFormValues>(emptyValues);
  const [internalDirection, setInternalDirection] = useState<"out" | "in">("out");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const autoAppliedRef = useRef<string | null>(null);

  const categoryNames = useMemo(
    () => categories.map((category) => category.name),
    [categories]
  );

  useEffect(() => {
    if (!open) return;

    if (transaction) {
      const formValues = transactionToFormValues(transaction);
      setValues({
        date: formValues.date,
        description: formValues.description,
        reference: formValues.reference,
        account_id: formValues.account_id,
        category: formValues.category,
        amount: formValues.amount,
        tx_type: formValues.tx_type,
        notes: formValues.notes,
        is_billing_error: formValues.is_billing_error,
        billing_error_status: formValues.billing_error_status,
      });
      setInternalDirection(formValues.internalDirection);
    } else {
      setValues({
        ...emptyValues,
        account_id: accounts[0]?.id ?? "",
      });
      setInternalDirection("out");
    }
    setError(null);
    setNewCategoryName("");
    setIsAddingCategory(false);
    setSuggestion(null);
    setCategoryTouched(Boolean(transaction?.category));
    autoAppliedRef.current = null;
  }, [open, transaction, accounts]);

  useEffect(() => {
    if (!open || categoryTouched) return;

    const description = values.description.trim();
    if (description.length < 3) {
      setSuggestion(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsSuggesting(true);
      const result = await suggestTransactionCategory(description, categoryNames);
      setIsSuggesting(false);
      setSuggestion(result);

      if (
        result &&
        result.confidence === "high" &&
        result.source === "mapping" &&
        !categoryTouched &&
        autoAppliedRef.current !== description
      ) {
        setValues((current) => ({ ...current, category: result.category }));
        autoAppliedRef.current = description;
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [open, values.description, categoryNames, categoryTouched]);

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    const result = await createCategory(newCategoryName.trim());
    if (!result.success) {
      setError(result.error);
      return;
    }
    onCategoriesChange([...categories, result.data]);
    setValues((current) => ({ ...current, category: result.data.name }));
    setNewCategoryName("");
    setIsAddingCategory(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    const result = transaction
      ? await updateTransaction(
          transaction.id,
          values,
          values.tx_type === "internal_transfer" ? internalDirection : undefined
        )
      : await createTransaction(
          values,
          values.tx_type === "internal_transfer" ? internalDirection : undefined
        );

    setIsLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit transaction" : "Add transaction"}
          </DialogTitle>
          <DialogDescription>
            Record a household transaction. Amounts are stored in ZAR.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tx-date">Date</Label>
              <Input
                id="tx-date"
                type="date"
                required
                value={values.date}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tx-type">Type</Label>
              <Select
                value={values.tx_type}
                onValueChange={(value) => {
                  if (!value) return;
                  setValues((current) => ({
                    ...current,
                    tx_type: value as TxType,
                  }));
                }}
              >
                <SelectTrigger id="tx-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TX_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {values.tx_type === "internal_transfer" ? (
            <Alert>
              <AlertDescription>
                Internal transfers move money between this household&apos;s own
                accounts (for example, between two of your bank accounts). They
                are excluded from spend and income totals.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="tx-description">Description</Label>
            <Input
              id="tx-description"
              required
              value={values.description}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
            {isSuggesting ? (
              <p className="text-xs text-muted-foreground">Looking up category…</p>
            ) : null}
            {suggestion && !categoryTouched ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <Sparkles className="size-3.5 text-muted-foreground" />
                <span>
                  Suggested: <strong>{suggestion.category}</strong>
                </span>
                <Badge variant="outline" className="text-xs">
                  {suggestion.source === "mapping"
                    ? "Saved merchant"
                    : suggestion.source === "history"
                      ? "Prior transactions"
                      : "AI"}
                </Badge>
                {values.category !== suggestion.category ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      setValues((current) => ({
                        ...current,
                        category: suggestion.category,
                      }));
                      autoAppliedRef.current = values.description.trim();
                    }}
                  >
                    Apply
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tx-reference">Reference</Label>
              <Input
                id="tx-reference"
                value={values.reference}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    reference: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tx-account">Account</Label>
              <Select
                value={values.account_id}
                onValueChange={(value) => {
                  if (!value) return;
                  setValues((current) => ({ ...current, account_id: value }));
                }}
              >
                <SelectTrigger id="tx-account" className="w-full">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({account.owner_display_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tx-category">Category</Label>
            <div className="flex gap-2">
              <Select
                value={values.category || "none"}
                onValueChange={(value) => {
                  setCategoryTouched(true);
                  setValues((current) => ({
                    ...current,
                    category: !value || value === "none" ? "" : value,
                  }));
                }}
              >
                <SelectTrigger id="tx-category" className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorised</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.name}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddingCategory((current) => !current)}
              >
                <Plus />
              </Button>
            </div>
            {isAddingCategory ? (
              <div className="flex gap-2">
                <Input
                  placeholder="New category name"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                />
                <Button type="button" onClick={handleAddCategory}>
                  Add
                </Button>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tx-amount">Amount (ZAR)</Label>
              <Input
                id="tx-amount"
                inputMode="decimal"
                required
                placeholder="1234.56"
                value={values.amount}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
              />
            </div>
            {values.tx_type === "internal_transfer" ? (
              <div className="space-y-2">
                <Label htmlFor="tx-direction">Direction for this account</Label>
                <Select
                  value={internalDirection}
                  onValueChange={(value) => {
                    if (value === "out" || value === "in") {
                      setInternalDirection(value);
                    }
                  }}
                >
                  <SelectTrigger id="tx-direction" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="out">Money out</SelectItem>
                    <SelectItem value="in">Money in</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tx-notes">Notes</Label>
            <Textarea
              id="tx-notes"
              value={values.notes}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="tx-billing-error"
                checked={values.is_billing_error}
                onCheckedChange={(checked) =>
                  setValues((current) => ({
                    ...current,
                    is_billing_error: checked === true,
                    billing_error_status:
                      checked === true
                        ? current.billing_error_status || "flagged"
                        : "",
                  }))
                }
              />
              <Label htmlFor="tx-billing-error" className="font-normal">
                Billing error (exclude from spend totals)
              </Label>
            </div>
            {values.is_billing_error ? (
              <div className="space-y-2">
                <Label htmlFor="tx-billing-status">Dispute status</Label>
                <Select
                  value={values.billing_error_status || "flagged"}
                  onValueChange={(value) => {
                    if (
                      value === "flagged" ||
                      value === "disputed" ||
                      value === "resolved"
                    ) {
                      setValues((current) => ({
                        ...current,
                        billing_error_status: value,
                      }));
                    }
                  }}
                >
                  <SelectTrigger id="tx-billing-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flagged">Flagged</SelectItem>
                    <SelectItem value="disputed">Disputed</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Flagged or disputed transactions are excluded from dashboard
                  and insight totals until resolved.
                </p>
              </div>
            ) : null}
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
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? "Saving…"
                : isEditing
                  ? "Save changes"
                  : "Add transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
