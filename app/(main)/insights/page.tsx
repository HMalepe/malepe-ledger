import { AppHeader } from "@/components/app-header";
import { MonthSelector } from "@/components/month-selector";
import { InsightsPageClient } from "@/components/insights/insights-page-client";
import { getInsightsPageData } from "@/lib/actions/insights";

export default async function InsightsPage() {
  const data = await getInsightsPageData();

  return (
    <>
      <AppHeader
        title="Insights"
        description={`AI-generated patterns for ${data.monthLabel}`}
        actions={
          <MonthSelector
            monthKey={data.selectedMonth}
            monthLabel={data.monthLabel}
          />
        }
      />
      <InsightsPageClient {...data} />
    </>
  );
}
