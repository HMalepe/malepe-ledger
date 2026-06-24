import { NextResponse } from "next/server";
import { format, startOfMonth } from "date-fns";

import { runInsightGeneration } from "@/lib/insights/generate-core";
import { getCachedInsight, getHouseholdCostState } from "@/lib/insights/data";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const monthKey = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const todayKey = format(new Date(), "yyyy-MM-dd");

  const { data: households, error } = await admin.from("households").select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: { householdId: string; status: string; error?: string }[] = [];

  for (const household of households ?? []) {
    const costState = await getHouseholdCostState(admin, household.id);

    if (costState.costLimitReached) {
      results.push({ householdId: household.id, status: "skipped_cost_limit" });
      continue;
    }

    if (costState.lastAutoInsightsAt?.startsWith(todayKey)) {
      results.push({ householdId: household.id, status: "skipped_already_ran_today" });
      continue;
    }

    const existing = await getCachedInsight(admin, household.id, monthKey);
    if (existing) {
      await admin
        .from("households")
        .update({ last_auto_insights_at: new Date().toISOString() })
        .eq("id", household.id);
      results.push({ householdId: household.id, status: "skipped_cached" });
      continue;
    }

    const generated = await runInsightGeneration({
      supabase: admin,
      householdId: household.id,
      month: monthKey,
    });

    if (!generated.success) {
      results.push({
        householdId: household.id,
        status: "failed",
        error: generated.error,
      });
      continue;
    }

    await admin
      .from("households")
      .update({ last_auto_insights_at: new Date().toISOString() })
      .eq("id", household.id);

    results.push({ householdId: household.id, status: "generated" });
  }

  return NextResponse.json({ ok: true, results });
}
