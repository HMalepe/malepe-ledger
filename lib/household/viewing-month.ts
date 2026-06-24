import { endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";

export function resolveViewingMonth(viewingMonth: string | null | undefined): Date {
  if (viewingMonth) {
    return startOfMonth(parseISO(viewingMonth));
  }
  return startOfMonth(new Date());
}

export function viewingMonthKey(viewingMonth: string | null | undefined): string {
  return format(resolveViewingMonth(viewingMonth), "yyyy-MM-dd");
}

export async function getHouseholdViewingMonth(
  supabase: SupabaseClient,
  householdId: string
): Promise<{ month: Date; monthKey: string; monthLabel: string }> {
  const { data, error } = await supabase
    .from("households")
    .select("viewing_month")
    .eq("id", householdId)
    .single();

  if (error) throw new Error(error.message);

  const month = resolveViewingMonth(data.viewing_month);
  return {
    month,
    monthKey: format(month, "yyyy-MM-dd"),
    monthLabel: format(month, "MMMM yyyy"),
  };
}

export async function setHouseholdViewingMonth(
  supabase: SupabaseClient,
  householdId: string,
  monthKey: string
) {
  const normalized = format(startOfMonth(parseISO(monthKey)), "yyyy-MM-dd");

  const { error } = await supabase
    .from("households")
    .update({ viewing_month: normalized })
    .eq("id", householdId);

  if (error) throw new Error(error.message);
  return normalized;
}

export function monthRangeFromViewingMonth(month: Date) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  return {
    monthStart,
    monthEnd,
    monthStartKey: format(monthStart, "yyyy-MM-dd"),
    monthEndKey: format(monthEnd, "yyyy-MM-dd"),
    monthLabel: format(monthStart, "MMMM yyyy"),
  };
}
