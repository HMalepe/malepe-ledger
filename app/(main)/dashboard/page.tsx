import { AppHeader } from "@/components/app-header";
import { MonthSelector } from "@/components/month-selector";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getDashboardData } from "@/lib/actions/dashboard";
import { getViewingMonthContext } from "@/lib/actions/settings";

export default async function DashboardPage() {
  const [data, viewing] = await Promise.all([
    getDashboardData(),
    getViewingMonthContext(),
  ]);

  return (
    <>
      <AppHeader
        title="Dashboard"
        description={`Household financial overview for ${data.monthLabel}`}
        actions={
          <MonthSelector
            monthKey={viewing.monthKey}
            monthLabel={viewing.monthLabel}
          />
        }
      />
      <DashboardView data={data} />
    </>
  );
}
