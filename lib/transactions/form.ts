import { absoluteAmountFromSigned } from "@/lib/transactions/currency";
import type { BillingErrorStatus, TransactionFormValues, TransactionRow } from "@/lib/transactions/types";

export function transactionToFormValues(
  transaction: TransactionRow
): TransactionFormValues & { internalDirection: "out" | "in" } {
  return {
    date: transaction.date,
    description: transaction.description,
    reference: transaction.reference ?? "",
    account_id: transaction.account_id,
    category: transaction.category ?? "",
    amount: absoluteAmountFromSigned(transaction.amount).toFixed(2),
    tx_type: transaction.tx_type,
    notes: transaction.notes ?? "",
    is_billing_error: transaction.is_billing_error,
    billing_error_status:
      (transaction.billing_error_status as BillingErrorStatus | null) ?? "flagged",
    internalDirection: transaction.is_debit ? "out" : "in",
  };
}
