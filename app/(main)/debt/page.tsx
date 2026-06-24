import { AppHeader } from "@/components/app-header";
import { DebtPageClient } from "@/components/debts/debt-page-client";
import { getDebtPageData } from "@/lib/actions/debts";

export default async function DebtPage() {
  const data = await getDebtPageData();

  return (
    <>
      <AppHeader
        title="Debt & Loans"
        description="Track money owed and pass-through self-funding transfers"
      />
      <DebtPageClient {...data} />
    </>
  );
}
