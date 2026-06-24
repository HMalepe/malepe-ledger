import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { MonthSelector } from "@/components/month-selector";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getDashboardData } from "@/lib/actions/dashboard";
import { getViewingMonthContext } from "@/lib/actions/settings";

type ProfileDashboardPageProps = {
  params: Promise<{ profileId: string }>;
};

export default async function ProfileDashboardPage({
  params,
}: ProfileDashboardPageProps) {
  const { profileId } = await params;

  let data;
  try {
    data = await getDashboardData(profileId);
  } catch {
    notFound();
  }

  const viewing = await getViewingMonthContext();

  return (
    <>
      <AppHeader
        title={`${data.scopeLabel}`}
        description={`Per-person financial detail for ${data.monthLabel}`}
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
