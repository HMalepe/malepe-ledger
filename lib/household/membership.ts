import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertAccountBelongsToHousehold(
  supabase: SupabaseClient,
  accountId: string,
  householdId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("Account not found in this household");
  }
}

export async function assertProfileBelongsToHousehold(
  supabase: SupabaseClient,
  profileId: string,
  householdId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("Profile not found in this household");
  }
}
