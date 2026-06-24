import { AppHeader } from "@/components/app-header";
import { SettingsPageClient } from "@/components/settings/settings-page-client";
import { getSettingsPageData } from "@/lib/actions/settings";

export default async function SettingsPage() {
  const data = await getSettingsPageData();

  return (
    <>
      <AppHeader
        title="Settings"
        description="Household preferences and account configuration"
      />
      <SettingsPageClient {...data} />
    </>
  );
}
