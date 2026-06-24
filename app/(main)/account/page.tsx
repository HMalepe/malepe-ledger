import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Account",
};

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <AppHeader
        title="Account"
        description="Manage your sign-in credentials"
      />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="max-w-md">
          <p className="mb-4 text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{user.email}</span>
          </p>
          <ChangePasswordForm email={user.email ?? ""} />
        </div>
      </div>
    </>
  );
}
