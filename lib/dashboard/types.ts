export type DashboardTransaction = {
  id: string;
  account_id: string;
  owner_profile_id: string;
  owner_display_name: string;
  date: string;
  amount: number;
  tx_type: string;
  category: string | null;
  is_internal_transfer: boolean;
  is_billing_error: boolean;
};

export type DashboardAccount = {
  id: string;
  name: string;
  owner_profile_id: string;
  owner_display_name: string;
  salary_day_of_month: number | null;
  salary_amount: number | null;
  low_balance_threshold: number;
};

export type DashboardProfile = {
  id: string;
  display_name: string;
};

export type DashboardDebt = {
  id: string;
  debt_type: "standard" | "pass_through";
  amount: number;
  repaid: boolean;
  inflow_amount: number | null;
  outflow_amount: number | null;
};

export type DashboardStats = {
  totalIncome: number;
  totalExpenses: number;
  surplus: number;
  moneyOwed: number;
};

export type CategorySpendRow = {
  category: string;
  [profileName: string]: string | number;
};

export type RunningBalancePoint = {
  date: string;
  label: string;
  balance: number;
};

export type DaysToZeroResult = {
  accountId: string;
  accountName: string;
  ownerDisplayName: string;
  configured: boolean;
  daysIntoCycle: number | null;
  cycleStartDate: string | null;
  threshold: number;
  message: string;
};

export type DashboardData = {
  monthLabel: string;
  monthStart: string;
  monthEnd: string;
  profiles: DashboardProfile[];
  stats: DashboardStats;
  categoryComparison: CategorySpendRow[];
  runningBalance: RunningBalancePoint[];
  daysToZero: DaysToZeroResult[];
  scopeLabel: string;
  profileId: string | null;
};
