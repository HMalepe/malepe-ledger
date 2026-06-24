export type TxType =
  | "expense"
  | "income"
  | "debt_in"
  | "debt_out"
  | "internal_transfer";

export type AmountMode = "signed" | "debit_credit";

export type ColumnMapping = {
  date: string;
  description: string;
  amount?: string;
  debit?: string;
  credit?: string;
  reference?: string;
  opening_balance?: string;
  closing_balance?: string;
};

export type BankProfile = {
  id: string;
  household_id: string | null;
  institution: string;
  profile_key: string;
  display_name: string;
  column_mapping: ColumnMapping;
  date_format: string | null;
  amount_mode: AmountMode;
};

export type AccountWithOwner = {
  id: string;
  name: string;
  institution: string;
  account_type: string;
  owner_profile_id: string;
  owner_display_name: string;
};

export type Category = {
  id: string;
  name: string;
  scope: "shared" | "individual";
};

export type TransactionRow = {
  id: string;
  household_id: string;
  account_id: string;
  account_name: string;
  owner_display_name: string;
  date: string;
  description: string;
  reference: string | null;
  category: string | null;
  amount: number;
  is_debit: boolean;
  tx_type: TxType;
  is_internal_transfer: boolean;
  is_billing_error: boolean;
  billing_error_status: string | null;
  notes: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type TransactionFilters = {
  accountId?: string;
  profileId?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  sortDir?: "asc" | "desc";
};

export type ParsedImportRow = {
  date: string;
  description: string;
  reference: string | null;
  amount: number;
  is_debit: boolean;
  row_hash: string;
  isDuplicate: boolean;
};

export type ImportPreview = {
  rows: ParsedImportRow[];
  duplicateCount: number;
  openingBalance: number | null;
  closingBalance: number | null;
  calculatedClosingBalance: number | null;
  reconciliationOk: boolean;
  reconciliationDiff: number | null;
  detectedProfile: BankProfile | null;
  headers: string[];
};

export type TransactionFormValues = {
  date: string;
  description: string;
  reference: string;
  account_id: string;
  category: string;
  amount: string;
  tx_type: TxType;
  notes: string;
};
