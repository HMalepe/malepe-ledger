import { AppHeader } from "@/components/app-header";
import { MonthSelector } from "@/components/month-selector";
import { TransactionsPageClient } from "@/components/transactions/transactions-page-client";
import { getTransactionPageData } from "@/lib/actions/transactions";

export default async function TransactionsPage() {
  const data = await getTransactionPageData({ sortDir: "desc" });

  return (
    <>
      <AppHeader
        title="Transactions"
        description={`Import, review, and manage transactions for ${data.monthLabel}`}
        actions={
          <MonthSelector monthKey={data.monthKey} monthLabel={data.monthLabel} />
        }
      />
      <TransactionsPageClient
        initialTransactions={data.transactions}
        accounts={data.accounts}
        categories={data.categories}
        profiles={data.profiles}
        bankProfiles={data.bankProfiles}
        monthLabel={data.monthLabel}
        initialFilters={data.defaultFilters}
      />
    </>
  );
}
