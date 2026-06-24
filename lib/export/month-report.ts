import { formatZar } from "@/lib/transactions/currency";
import { computeHouseholdTotals } from "@/lib/transactions/exclusions";

export type ExportTransactionRow = {
  id?: string;
  date: string;
  description: string;
  reference: string | null;
  account_name: string;
  owner_display_name: string;
  category: string | null;
  amount: number;
  tx_type: string;
  is_internal_transfer?: boolean;
  is_billing_error?: boolean;
};

export function buildMonthCsv(
  monthLabel: string,
  transactions: ExportTransactionRow[],
  passThroughIds: Set<string> = new Set()
): string {
  const headers = [
    "Date",
    "Description",
    "Reference",
    "Account",
    "Person",
    "Category",
    "Type",
    "Amount (ZAR)",
  ];

  const lines = transactions.map((tx) =>
    [
      tx.date,
      escapeCsv(tx.description),
      escapeCsv(tx.reference ?? ""),
      escapeCsv(tx.account_name),
      escapeCsv(tx.owner_display_name),
      escapeCsv(tx.category ?? ""),
      tx.tx_type,
      tx.amount.toFixed(2),
    ].join(",")
  );

  const { income, expenses, surplus } = computeHouseholdTotals(
    transactions,
    passThroughIds
  );

  return [
    `# Malepe Ledger export — ${monthLabel}`,
    `# Income: ${formatZar(income)} | Expenses: ${formatZar(expenses)} | Surplus: ${formatZar(surplus)}`,
    headers.join(","),
    ...lines,
  ].join("\n");
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildMonthPrintHtml(
  monthLabel: string,
  transactions: ExportTransactionRow[],
  passThroughIds: Set<string> = new Set()
): string {
  const { income, expenses, surplus } = computeHouseholdTotals(
    transactions,
    passThroughIds
  );

  const rows = transactions
    .map(
      (tx) => `
      <tr>
        <td>${tx.date}</td>
        <td>${escapeHtml(tx.description)}</td>
        <td>${escapeHtml(tx.account_name)}</td>
        <td>${escapeHtml(tx.owner_display_name)}</td>
        <td>${escapeHtml(tx.category ?? "—")}</td>
        <td>${tx.tx_type}</td>
        <td style="text-align:right">${formatZar(tx.amount)}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Malepe Ledger — ${escapeHtml(monthLabel)}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 24px; color: #111; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #555; font-size: 13px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; }
    th { background: #f4f4f5; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>Malepe Ledger — ${escapeHtml(monthLabel)}</h1>
  <p class="meta">
    Income: ${formatZar(income)} · Expenses: ${formatZar(expenses)} · Surplus: ${formatZar(surplus)}
  </p>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th>Account</th>
        <th>Person</th>
        <th>Category</th>
        <th>Type</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
