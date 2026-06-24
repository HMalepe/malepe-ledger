export type DebtType = "standard" | "pass_through";

export type LinkedTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
};

export type StandardDebtRow = {
  id: string;
  creditor_name: string;
  amount: number;
  currency: string;
  date_borrowed: string;
  date_due: string | null;
  repaid: boolean;
  repaid_at: string | null;
  notes: string | null;
};

export type PassThroughDebtRow = {
  id: string;
  creditor_name: string;
  amount: number;
  currency: string;
  date_borrowed: string;
  date_due: string | null;
  repaid: boolean;
  repaid_at: string | null;
  notes: string | null;
  inflow: LinkedTransaction | null;
  outflow: LinkedTransaction | null;
  netEffect: number;
};

export type DebtPageData = {
  totalCurrentlyOwed: number;
  standardDebts: StandardDebtRow[];
  passThroughDebts: PassThroughDebtRow[];
  linkableTransactions: LinkedTransaction[];
};

export type CreateStandardDebtInput = {
  creditor_name: string;
  amount: string;
  date_borrowed: string;
  date_due: string;
  notes: string;
};

export type CreatePassThroughDebtInput = {
  creditor_name: string;
  date_borrowed: string;
  date_due: string;
  notes: string;
  inflow_transaction_id: string;
  outflow_transaction_id: string;
};
