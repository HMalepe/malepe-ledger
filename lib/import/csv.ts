import { parse, isValid, format } from "date-fns";

import type {
  AmountMode,
  BankProfile,
  ColumnMapping,
  ParsedImportRow,
} from "@/lib/transactions/types";
import { computeTransactionRowHash } from "@/lib/transactions/hash";

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => splitCsvLine(line, delimiter));

  return { headers, rows };
}

function detectDelimiter(line: string): string {
  const commaCount = (line.match(/,/g) ?? []).length;
  const semicolonCount = (line.match(/;/g) ?? []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells;
}

export function detectBankProfile(
  headers: string[],
  profiles: BankProfile[]
): BankProfile | null {
  const normalizedHeaders = new Set(headers.map(normalizeHeader));

  let best: BankProfile | null = null;
  let bestScore = 0;

  for (const profile of profiles) {
    const mapping = profile.column_mapping;
    const required = [
      mapping.date,
      mapping.description,
      mapping.amount ?? mapping.debit,
    ].filter(Boolean) as string[];

    const score = required.reduce(
      (total, column) =>
        total + (normalizedHeaders.has(normalizeHeader(column)) ? 1 : 0),
      0
    );

    if (score > bestScore) {
      best = profile;
      bestScore = score;
    }
  }

  return bestScore >= 2 ? best : null;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function getCell(
  row: string[],
  headers: string[],
  columnName?: string
): string | null {
  if (!columnName) return null;
  const index = headers.findIndex(
    (header) => normalizeHeader(header) === normalizeHeader(columnName)
  );
  if (index === -1) return null;
  return row[index]?.trim() ?? null;
}

function parseDateValue(value: string, dateFormat?: string | null): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const formats = [
    dateFormat,
    "yyyy-MM-dd",
    "yyyy/MM/dd",
    "dd/MM/yyyy",
    "dd-MM-yyyy",
    "dd MMM yyyy",
    "d MMM yyyy",
  ].filter(Boolean) as string[];

  for (const fmt of formats) {
    const parsed = parse(trimmed, fmt, new Date());
    if (isValid(parsed)) {
      return format(parsed, "yyyy-MM-dd");
    }
  }

  const iso = new Date(trimmed);
  if (isValid(iso)) {
    return format(iso, "yyyy-MM-dd");
  }

  return null;
}

function parseMoney(value: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[R\s]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-") return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}

function amountFromRow(
  row: string[],
  headers: string[],
  mapping: ColumnMapping,
  amountMode: AmountMode
): { amount: number; is_debit: boolean } | null {
  if (amountMode === "signed") {
    const raw = parseMoney(getCell(row, headers, mapping.amount));
    if (raw === null) return null;
    return { amount: raw, is_debit: raw < 0 };
  }

  const debit = parseMoney(getCell(row, headers, mapping.debit)) ?? 0;
  const credit = parseMoney(getCell(row, headers, mapping.credit)) ?? 0;

  if (debit > 0 && credit > 0) return null;
  if (debit > 0) return { amount: -Math.abs(debit), is_debit: true };
  if (credit > 0) return { amount: Math.abs(credit), is_debit: false };
  return null;
}

export function parseImportRows(input: {
  csvText: string;
  accountId: string;
  profile: BankProfile;
  existingHashes: Set<string>;
}): {
  headers: string[];
  rows: ParsedImportRow[];
  duplicateCount: number;
  openingBalance: number | null;
  closingBalance: number | null;
} {
  const { headers, rows: rawRows } = parseCsv(input.csvText);
  const mapping = input.profile.column_mapping;
  const parsedRows: ParsedImportRow[] = [];
  let duplicateCount = 0;

  let openingBalance: number | null = null;
  let closingBalance: number | null = null;

  for (const row of rawRows) {
    const openingCell = getCell(row, headers, mapping.opening_balance);
    const closingCell = getCell(row, headers, mapping.closing_balance);
    if (openingCell && openingBalance === null) {
      openingBalance = parseMoney(openingCell);
    }
    if (closingCell && closingBalance === null) {
      closingBalance = parseMoney(closingCell);
    }

    const date = parseDateValue(
      getCell(row, headers, mapping.date) ?? "",
      input.profile.date_format
    );
    const description = getCell(row, headers, mapping.description);
    const amountInfo = amountFromRow(
      row,
      headers,
      mapping,
      input.profile.amount_mode
    );

    if (!date || !description || !amountInfo) continue;

    const rowHash = computeTransactionRowHash({
      date,
      description,
      amount: amountInfo.amount,
      accountId: input.accountId,
    });

    const isDuplicate = input.existingHashes.has(rowHash);
    if (isDuplicate) duplicateCount += 1;

    parsedRows.push({
      date,
      description,
      reference: getCell(row, headers, mapping.reference),
      amount: amountInfo.amount,
      is_debit: amountInfo.is_debit,
      row_hash: rowHash,
      isDuplicate,
    });
  }

  return {
    headers,
    rows: parsedRows,
    duplicateCount,
    openingBalance,
    closingBalance,
  };
}

export function reconcileImport(input: {
  openingBalance: number | null;
  closingBalance: number | null;
  rows: ParsedImportRow[];
}): {
  calculatedClosingBalance: number | null;
  reconciliationOk: boolean;
  reconciliationDiff: number | null;
} {
  if (input.openingBalance === null || input.closingBalance === null) {
    return {
      calculatedClosingBalance: null,
      reconciliationOk: true,
      reconciliationDiff: null,
    };
  }

  const nonDuplicateTotal = input.rows
    .filter((row) => !row.isDuplicate)
    .reduce((sum, row) => sum + row.amount, 0);

  const calculatedClosingBalance =
    Math.round((input.openingBalance + nonDuplicateTotal) * 100) / 100;
  const reconciliationDiff =
    Math.round((calculatedClosingBalance - input.closingBalance) * 100) / 100;
  const reconciliationOk = Math.abs(reconciliationDiff) <= 0.01;

  return {
    calculatedClosingBalance,
    reconciliationOk,
    reconciliationDiff,
  };
}

export function inferTxType(amount: number): "expense" | "income" {
  return amount < 0 ? "expense" : "income";
}
