import type { Category } from "@/lib/transactions/types";

export type SettingsAccount = {
  id: string;
  name: string;
  institution: string;
  account_type: string;
  owner_profile_id: string;
  owner_display_name: string;
  salary_day_of_month: number | null;
  salary_amount: number | null;
  low_balance_threshold: number;
  transaction_count: number;
};

export type SettingsPageData = {
  monthKey: string;
  monthLabel: string;
  accounts: SettingsAccount[];
  categories: Category[];
  profiles: { id: string; display_name: string }[];
};

export type AccountFormValues = {
  name: string;
  institution: string;
  account_type: string;
  owner_profile_id: string;
  salary_day_of_month: string;
  salary_amount: string;
  low_balance_threshold: string;
};

export const ACCOUNT_TYPE_OPTIONS = [
  { value: "cheque", label: "Cheque" },
  { value: "savings", label: "Savings" },
  { value: "credit", label: "Credit" },
] as const;
