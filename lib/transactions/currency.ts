export function formatZar(amount: number): string {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return amount < 0 ? `-R ${formatted}` : `R ${formatted}`;
}

export function parseAmountInput(value: string): number {
  const normalized = value.replace(/[R\s,]/g, "");
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) {
    throw new Error("Invalid amount");
  }
  return parsed;
}

export function signedAmountFromInput(
  absoluteAmount: number,
  txType: import("./types").TxType
): { amount: number; is_debit: boolean } {
  const isOutflow =
    txType === "expense" ||
    txType === "debt_out" ||
    (txType === "internal_transfer" && absoluteAmount > 0);

  if (txType === "internal_transfer") {
    const isDebit = absoluteAmount >= 0;
    return {
      amount: isDebit ? -Math.abs(absoluteAmount) : Math.abs(absoluteAmount),
      is_debit: isDebit,
    };
  }

  if (isOutflow) {
    return { amount: -Math.abs(absoluteAmount), is_debit: true };
  }

  return { amount: Math.abs(absoluteAmount), is_debit: false };
}

export function absoluteAmountFromSigned(amount: number): number {
  return Math.abs(amount);
}
