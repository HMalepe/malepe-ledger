"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

import {
  commitCsvImport,
  previewCsvImport,
} from "@/lib/actions/transactions";
import { formatZar } from "@/lib/transactions/currency";
import type {
  AccountWithOwner,
  BankProfile,
  ImportPreview,
} from "@/lib/transactions/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

type ImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountWithOwner[];
  bankProfiles: BankProfile[];
};

export function ImportDialog({
  open,
  onOpenChange,
  accounts,
  bankProfiles,
}: ImportDialogProps) {
  const router = useRouter();
  const [accountId, setAccountId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [filename, setFilename] = useState("");
  const [csvText, setCsvText] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [closingBalance, setClosingBalance] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [acknowledgeWarning, setAcknowledgeWarning] = useState(false);

  const selectedAccount = accounts.find((account) => account.id === accountId);

  const availableProfiles = useMemo(() => {
    if (!selectedAccount) return bankProfiles;
    const institutionMatches = bankProfiles.filter(
      (profile) =>
        profile.institution.toLowerCase() ===
        selectedAccount.institution.toLowerCase()
    );
    return institutionMatches.length > 0 ? institutionMatches : bankProfiles;
  }, [bankProfiles, selectedAccount]);

  useEffect(() => {
    if (!open) return;
    setAccountId(accounts[0]?.id ?? "");
    setProfileId("");
    setFilename("");
    setCsvText("");
    setOpeningBalance("");
    setClosingBalance("");
    setPreview(null);
    setError(null);
    setAcknowledgeWarning(false);
  }, [open, accounts]);

  useEffect(() => {
    if (!selectedAccount) return;
    const defaultProfile = availableProfiles[0];
    if (defaultProfile && !profileId) {
      setProfileId(defaultProfile.id);
    }
  }, [availableProfiles, profileId, selectedAccount]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setCsvText(await file.text());
    setPreview(null);
    setAcknowledgeWarning(false);
  }

  async function handlePreview() {
    if (!accountId || !csvText) {
      setError("Choose an account and upload a CSV file first.");
      return;
    }

    setIsPreviewing(true);
    setError(null);

    const result = await previewCsvImport({
      csvText,
      accountId,
      profileId: profileId || undefined,
      openingBalance,
      closingBalance,
    });

    setIsPreviewing(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setPreview(result.data);
    if (result.data.detectedProfile) {
      setProfileId(result.data.detectedProfile.id);
    }
    setAcknowledgeWarning(false);
  }

  async function handleCommit() {
    if (!accountId || !csvText || !profileId || !preview) {
      setError("Preview the import before committing.");
      return;
    }

    setIsCommitting(true);
    setError(null);

    const result = await commitCsvImport({
      csvText,
      accountId,
      filename: filename || "import.csv",
      profileId,
      openingBalance,
      closingBalance,
      acknowledgeReconciliationWarning: acknowledgeWarning,
    });

    setIsCommitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    const message = [
      `${result.data.importedCount} transaction(s) imported.`,
      result.data.duplicateCount > 0
        ? `${result.data.duplicateCount} duplicate row(s) skipped.`
        : null,
      result.data.batchStatus === "flagged"
        ? "Import batch flagged due to reconciliation mismatch."
        : null,
    ]
      .filter(Boolean)
      .join(" ");

    window.alert(message);
    onOpenChange(false);
    router.refresh();
  }

  const previewRows = preview?.rows.filter((row) => !row.isDuplicate).slice(0, 20) ?? [];
  const needsWarningAck = Boolean(
    preview &&
      preview.openingBalance !== null &&
      preview.closingBalance !== null &&
      !preview.reconciliationOk
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import CSV statement</DialogTitle>
          <DialogDescription>
            Map bank export columns, preview rows, and reconcile balances before
            committing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="import-account">Account</Label>
              <Select
                value={accountId}
                onValueChange={(value) => setAccountId(value ?? "")}
              >
                <SelectTrigger id="import-account" className="w-full">
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({account.institution})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-profile">Bank profile</Label>
              <Select
                value={profileId}
                onValueChange={(value) => setProfileId(value ?? "")}
              >
                <SelectTrigger id="import-profile" className="w-full">
                  <SelectValue placeholder="Select mapping profile" />
                </SelectTrigger>
                <SelectContent>
                  {availableProfiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="import-file">CSV file</Label>
            <Input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="import-opening">Opening balance (optional)</Label>
              <Input
                id="import-opening"
                inputMode="decimal"
                placeholder="From statement"
                value={openingBalance}
                onChange={(event) => setOpeningBalance(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-closing">Closing balance (optional)</Label>
              <Input
                id="import-closing"
                inputMode="decimal"
                placeholder="From statement"
                value={closingBalance}
                onChange={(event) => setClosingBalance(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handlePreview}
              disabled={isPreviewing || !csvText}
            >
              <Upload />
              {isPreviewing ? "Parsing…" : "Preview import"}
            </Button>
          </div>

          {preview ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {preview.rows.filter((row) => !row.isDuplicate).length} new rows
                </Badge>
                <Badge variant="outline">
                  {preview.duplicateCount} duplicate row(s) skipped
                </Badge>
                {preview.detectedProfile ? (
                  <Badge variant="outline">
                    Profile: {preview.detectedProfile.display_name}
                  </Badge>
                ) : null}
              </div>

              {preview.openingBalance !== null &&
              preview.closingBalance !== null ? (
                <Alert variant={preview.reconciliationOk ? "default" : "destructive"}>
                  <AlertTitle>
                    {preview.reconciliationOk
                      ? "Reconciliation passed"
                      : "Reconciliation failed"}
                  </AlertTitle>
                  <AlertDescription className="space-y-1">
                    <p>
                      Opening {formatZar(preview.openingBalance)} + transactions{" "}
                      {formatZar(
                        preview.rows
                          .filter((row) => !row.isDuplicate)
                          .reduce((sum, row) => sum + row.amount, 0)
                      )}{" "}
                      = calculated closing{" "}
                      {formatZar(preview.calculatedClosingBalance ?? 0)}.
                    </p>
                    <p>
                      Stated closing balance: {formatZar(preview.closingBalance)}.
                      {preview.reconciliationDiff !== null
                        ? ` Difference: ${formatZar(preview.reconciliationDiff)}.`
                        : null}
                    </p>
                    {!preview.reconciliationOk ? (
                      <p>
                        This import will be flagged. Confirm below before
                        committing.
                      </p>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              {needsWarningAck ? (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={acknowledgeWarning}
                    onChange={(event) =>
                      setAcknowledgeWarning(event.target.checked)
                    }
                  />
                  <span>
                    I understand this statement does not reconcile within 1 cent
                    and still want to commit this import batch as flagged.
                  </span>
                </label>
              ) : null}

              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, index) => (
                      <TableRow key={`${row.row_hash}-${index}`}>
                        <TableCell>{row.date}</TableCell>
                        <TableCell>{row.description}</TableCell>
                        <TableCell className="text-right">
                          {formatZar(row.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {preview.rows.length > previewRows.length ? (
                <p className="text-xs text-muted-foreground">
                  Showing first {previewRows.length} new rows of{" "}
                  {preview.rows.filter((row) => !row.isDuplicate).length}.
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCommit}
            disabled={
              isCommitting ||
              !preview ||
              (needsWarningAck && !acknowledgeWarning)
            }
          >
            {isCommitting ? "Committing…" : "Commit import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
