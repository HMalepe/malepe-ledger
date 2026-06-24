"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { DashboardData } from "@/lib/dashboard/types";
import { CategoryComparisonChart } from "@/components/dashboard/category-comparison-chart";
import { DaysToZeroWidget } from "@/components/dashboard/days-to-zero-widget";
import { RunningBalanceChart } from "@/components/dashboard/running-balance-chart";
import { StatCards } from "@/components/dashboard/stat-cards";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DashboardViewProps = {
  data: DashboardData;
};

export function DashboardView({ data }: DashboardViewProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{data.scopeLabel}</p>
          <p className="text-xs text-muted-foreground">
            {data.monthLabel} · live from Supabase
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({
                variant: data.profileId ? "outline" : "default",
                size: "sm",
              })
            )}
          >
            Household
          </Link>
          {data.profiles.map((profile) => (
            <Link
              key={profile.id}
              href={`/dashboard/${profile.id}`}
              className={cn(
                buttonVariants({
                  variant:
                    pathname === `/dashboard/${profile.id}` ? "default" : "outline",
                  size: "sm",
                })
              )}
            >
              {profile.display_name}
            </Link>
          ))}
        </div>
      </div>

      <StatCards stats={data.stats} monthLabel={data.monthLabel} />

      <div className="grid gap-6 xl:grid-cols-2">
        <CategoryComparisonChart
          data={data.categoryComparison}
          profiles={data.profiles}
          profileId={data.profileId}
        />
        <RunningBalanceChart
          data={data.runningBalance}
          monthLabel={data.monthLabel}
        />
      </div>

      <DaysToZeroWidget results={data.daysToZero} />
    </div>
  );
}
