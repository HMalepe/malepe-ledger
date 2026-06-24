"use server";

import {
  learnMerchantCategoryMapping,
  suggestCategoryForDescription,
} from "@/lib/categories/suggest";
import type { CategorySuggestion } from "@/lib/categories/types";
import { createClient } from "@/lib/supabase/server";

async function getHouseholdContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Not authenticated");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("Profile not found");
  }

  return { supabase, profile };
}

export async function suggestTransactionCategory(
  description: string,
  availableCategories: string[]
): Promise<CategorySuggestion | null> {
  try {
    const { supabase, profile } = await getHouseholdContext();
    return await suggestCategoryForDescription(
      supabase,
      profile.household_id,
      description,
      availableCategories
    );
  } catch {
    return null;
  }
}

export async function recordMerchantCategoryLearning(
  description: string,
  categoryName: string
): Promise<void> {
  try {
    const { supabase, profile } = await getHouseholdContext();
    await learnMerchantCategoryMapping(
      supabase,
      profile.household_id,
      description,
      categoryName,
      "learned"
    );
  } catch {
    // Learning is best-effort and should not block saves.
  }
}
