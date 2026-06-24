import type { SupabaseClient } from "@supabase/supabase-js";

import {
  extractMerchantTokens,
  normalizeMerchantKey,
  pickDominantCategory,
} from "./merchant";
import { suggestCategoryWithAi } from "./suggest-ai";
import type { CategorySuggestion } from "./types";

export type { CategorySuggestion } from "./types";

export async function learnMerchantCategoryMapping(
  supabase: SupabaseClient,
  householdId: string,
  description: string,
  categoryName: string,
  source: "learned" | "manual" | "ai" = "learned"
) {
  const trimmedCategory = categoryName.trim();
  if (!trimmedCategory || !description.trim()) return;

  const merchantKey =
    extractMerchantTokens(description).at(-1) ?? normalizeMerchantKey(description);

  const { data: existing } = await supabase
    .from("merchant_category_mappings")
    .select("id, hit_count, category_name")
    .eq("household_id", householdId)
    .eq("merchant_key", merchantKey)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("merchant_category_mappings")
      .update({
        category_name: trimmedCategory,
        source,
        hit_count:
          existing.category_name === trimmedCategory
            ? existing.hit_count + 1
            : 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return;
  }

  await supabase.from("merchant_category_mappings").insert({
    household_id: householdId,
    merchant_key: merchantKey,
    category_name: trimmedCategory,
    source,
  });
}

export async function suggestCategoryForDescription(
  supabase: SupabaseClient,
  householdId: string,
  description: string,
  availableCategories: string[]
): Promise<CategorySuggestion | null> {
  const trimmed = description.trim();
  if (trimmed.length < 3 || availableCategories.length === 0) {
    return null;
  }

  const tokens = extractMerchantTokens(trimmed);
  const primaryKey = tokens.at(-1) ?? normalizeMerchantKey(trimmed);

  const { data: mappings } = await supabase
    .from("merchant_category_mappings")
    .select("merchant_key, category_name, hit_count")
    .eq("household_id", householdId)
    .in("merchant_key", tokens.length > 0 ? tokens : [primaryKey])
    .order("hit_count", { ascending: false });

  if (mappings && mappings.length > 0) {
    const best = mappings[0];
    if (
      best &&
      availableCategories.some(
        (category) => category.toLowerCase() === best.category_name.toLowerCase()
      )
    ) {
      return {
        category: best.category_name,
        source: "mapping",
        confidence: best.hit_count >= 3 ? "high" : "medium",
        merchantKey: best.merchant_key,
      };
    }
  }

  const { data: historyRows } = await supabase
    .from("transactions")
    .select("description, category")
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .not("category", "is", null)
    .ilike("description", `%${primaryKey}%`)
    .limit(50);

  const votes = new Map<string, number>();
  for (const row of historyRows ?? []) {
    if (!row.category) continue;
    const rowKey = normalizeMerchantKey(row.description);
    const matchesToken = tokens.some(
      (token) => rowKey.includes(token) || token.includes(primaryKey)
    );
    if (!matchesToken && !rowKey.includes(primaryKey)) continue;
    if (!availableCategories.includes(row.category)) continue;
    votes.set(row.category, (votes.get(row.category) ?? 0) + 1);
  }

  const dominant = pickDominantCategory(
    Array.from(votes.entries()).map(([category, count]) => ({ category, count })),
    1
  );

  if (dominant) {
    return {
      category: dominant.category,
      source: "history",
      confidence: dominant.confidence,
      merchantKey: primaryKey,
    };
  }

  const aiCategory = await suggestCategoryWithAi({
    description: trimmed,
    categories: availableCategories,
  });

  if (aiCategory) {
    return {
      category: aiCategory,
      source: "ai",
      confidence: "low",
      merchantKey: primaryKey,
    };
  }

  return null;
}
