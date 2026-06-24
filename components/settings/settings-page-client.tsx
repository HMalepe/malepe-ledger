"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Pencil, Plus, Trash2 } from "lucide-react";

import {
  createAccount,
  createHouseholdCategory,
  deleteAccount,
  deleteHouseholdCategory,
  exportViewingMonthCsv,
  exportViewingMonthPdf,
  updateAccount,
  updateHouseholdCategory,
} from "@/lib/actions/settings";
import { downloadCsv, openPrintablePdf } from "@/lib/export/month-report-client";
import { formatZar } from "@/lib/transactions/currency";
import type { Category } from "@/lib/transactions/types";
import {
  ACCOUNT_TYPE_OPTIONS,
  type AccountFormValues,
  type SettingsAccount,
  type SettingsPageData,
} from "@/lib/settings/types";
import { MonthSelector } from "@/components/month-selector";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

type SettingsPageClientProps = SettingsPageData;

const emptyAccountForm = (profiles: SettingsPageData["profiles"]): AccountFormValues => ({
  name: "",
  institution: "",
  account_type: "cheque",
  owner_profile_id: profiles[0]?.id ?? "",
  salary_day_of_month: "",
  salary_amount: "",
  low_balance_threshold: "200",
});

export function SettingsPageClient({
  monthKey,
  monthLabel,
  accounts: initialAccounts,
  categories: initialCategories,
  profiles,
}: SettingsPageClientProps) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [categories, setCategories] = useState(initialCategories);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<"csv" | "pdf" | null>(null);

  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SettingsAccount | null>(null);
  const [accountForm, setAccountForm] = useState<AccountFormValues>(
    emptyAccountForm(profiles)
  );
  const [isAccountSaving, setIsAccountSaving] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryScope, setNewCategoryScope] = useState<"shared" | "individual">(
    "shared"
  );
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editCategoryScope, setEditCategoryScope] = useState<"shared" | "individual">(
    "shared"
  );
  const [isCategorySaving, setIsCategorySaving] = useState(false);

  useEffect(() => {
    setAccounts(initialAccounts);
    setCategories(initialCategories);
  }, [initialAccounts, initialCategories, monthKey]);

  function openAddAccount() {
    setEditingAccount(null);
    setAccountForm(emptyAccountForm(profiles));
    setError(null);
    setIsAccountOpen(true);
  }

  function openEditAccount(account: SettingsAccount) {
    setEditingAccount(account);
    setAccountForm({
      name: account.name,
      institution: account.institution,
      account_type: account.account_type,
      owner_profile_id: account.owner_profile_id,
      salary_day_of_month: account.salary_day_of_month?.toString() ?? "",
      salary_amount: account.salary_amount?.toString() ?? "",
      low_balance_threshold: account.low_balance_threshold.toString(),
    });
    setError(null);
    setIsAccountOpen(true);
  }

  async function handleSaveAccount() {
    setIsAccountSaving(true);
    setError(null);

    const result = editingAccount
      ? await updateAccount(editingAccount.id, accountForm)
      : await createAccount(accountForm);

    setIsAccountSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setIsAccountOpen(false);
    router.refresh();
  }

  async function handleDeleteAccount(account: SettingsAccount) {
    if (
      !window.confirm(
        `Delete ${account.name}? This cannot be undone.`
      )
    ) {
      return;
    }

    setError(null);
    const result = await deleteAccount(account.id);
    if (!result.success) {
      setError(result.error);
      return;
    }

    setAccounts((current) => current.filter((item) => item.id !== account.id));
    router.refresh();
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;

    setIsCategorySaving(true);
    setError(null);

    const result = await createHouseholdCategory(
      newCategoryName.trim(),
      newCategoryScope
    );

    setIsCategorySaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setCategories((current) =>
      [...current, result.data].sort((a, b) => a.name.localeCompare(b.name))
    );
    setNewCategoryName("");
    router.refresh();
  }

  function openEditCategory(category: Category) {
    setEditingCategory(category);
    setEditCategoryName(category.name);
    setEditCategoryScope(category.scope);
    setError(null);
  }

  async function handleSaveCategory() {
    if (!editingCategory || !editCategoryName.trim()) return;

    setIsCategorySaving(true);
    setError(null);

    const result = await updateHouseholdCategory(
      editingCategory.id,
      editCategoryName.trim(),
      editCategoryScope
    );

    setIsCategorySaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setCategories((current) =>
      current
        .map((item) =>
          item.id === editingCategory.id
            ? {
                ...item,
                name: editCategoryName.trim(),
                scope: editCategoryScope,
              }
            : item
        )
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setEditingCategory(null);
    router.refresh();
  }

  async function handleDeleteCategory(category: Category) {
    if (!window.confirm(`Delete category "${category.name}"?`)) return;

    setError(null);
    const result = await deleteHouseholdCategory(category.id);
    if (!result.success) {
      setError(result.error);
      return;
    }

    setCategories((current) => current.filter((item) => item.id !== category.id));
    router.refresh();
  }

  async function handleExportCsv() {
    setIsExporting("csv");
    setError(null);

    const result = await exportViewingMonthCsv();
    setIsExporting(null);

    if (!result.success) {
      setError(result.error);
      return;
    }

    downloadCsv(result.data.filename, result.data.content);
  }

  async function handleExportPdf() {
    setIsExporting("pdf");
    setError(null);

    const result = await exportViewingMonthPdf();
    setIsExporting(null);

    if (!result.success) {
      setError(result.error);
      return;
    }

    openPrintablePdf(result.data.html);
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Viewing period</CardTitle>
          <CardDescription>
            Both household members share the same month across Dashboard,
            Transactions, and Insights.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <MonthSelector monthKey={monthKey} monthLabel={monthLabel} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isExporting !== null}
              onClick={handleExportCsv}
            >
              <Download />
              Export CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isExporting !== null}
              onClick={handleExportPdf}
            >
              <FileText />
              Export PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Bank accounts</CardTitle>
            <CardDescription>
              One owner per account. Salary fields power the Days-to-Zero widget.
            </CardDescription>
          </div>
          <Button type="button" onClick={openAddAccount}>
            <Plus />
            Add account
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell>{account.institution}</TableCell>
                  <TableCell className="capitalize">{account.account_type}</TableCell>
                  <TableCell>{account.owner_display_name}</TableCell>
                  <TableCell>
                    {account.salary_amount
                      ? `${formatZar(account.salary_amount)} on day ${account.salary_day_of_month ?? "—"}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEditAccount(account)}
                        aria-label={`Edit ${account.name}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDeleteAccount(account)}
                        aria-label={`Delete ${account.name}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            Household spending categories used when tagging transactions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1 space-y-1.5">
              <Label htmlFor="new-category">New category</Label>
              <Input
                id="new-category"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="e.g. Groceries"
              />
            </div>
            <div className="w-40 space-y-1.5">
              <Label>Scope</Label>
              <Select
                value={newCategoryScope}
                onValueChange={(value) => {
                  if (value) setNewCategoryScope(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shared">Shared</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              disabled={isCategorySaving || !newCategoryName.trim()}
              onClick={handleCreateCategory}
            >
              <Plus />
              Add
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {category.scope}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEditCategory(category)}
                        aria-label={`Edit ${category.name}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDeleteCategory(category)}
                        aria-label={`Delete ${category.name}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isAccountOpen} onOpenChange={setIsAccountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? "Edit account" : "Add account"}
            </DialogTitle>
            <DialogDescription>
              Accounts are tied to one household member.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="account-name">Name</Label>
              <Input
                id="account-name"
                value={accountForm.name}
                onChange={(event) =>
                  setAccountForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="account-institution">Institution</Label>
              <Input
                id="account-institution"
                value={accountForm.institution}
                onChange={(event) =>
                  setAccountForm((current) => ({
                    ...current,
                    institution: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Account type</Label>
                <Select
                  value={accountForm.account_type}
                  onValueChange={(value) => {
                    if (!value) return;
                    setAccountForm((current) => ({
                      ...current,
                      account_type: value,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Owner</Label>
                <Select
                  value={accountForm.owner_profile_id}
                  onValueChange={(value) => {
                    if (!value) return;
                    setAccountForm((current) => ({
                      ...current,
                      owner_profile_id: value,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="salary-day">Salary day</Label>
                <Input
                  id="salary-day"
                  type="number"
                  min={1}
                  max={31}
                  value={accountForm.salary_day_of_month}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      salary_day_of_month: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="salary-amount">Salary amount</Label>
                <Input
                  id="salary-amount"
                  value={accountForm.salary_amount}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      salary_amount: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="low-balance">Low balance threshold</Label>
                <Input
                  id="low-balance"
                  value={accountForm.low_balance_threshold}
                  onChange={(event) =>
                    setAccountForm((current) => ({
                      ...current,
                      low_balance_threshold: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAccountOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isAccountSaving}
              onClick={handleSaveAccount}
            >
              {editingAccount ? "Save changes" : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingCategory !== null}
        onOpenChange={(open) => {
          if (!open) setEditingCategory(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-category-name">Name</Label>
              <Input
                id="edit-category-name"
                value={editCategoryName}
                onChange={(event) => setEditCategoryName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select
                value={editCategoryScope}
                onValueChange={(value) => {
                  if (value) setEditCategoryScope(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="shared">Shared</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingCategory(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isCategorySaving || !editCategoryName.trim()}
              onClick={handleSaveCategory}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
