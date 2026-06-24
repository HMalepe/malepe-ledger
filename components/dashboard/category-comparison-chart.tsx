"use client";

import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatZar } from "@/lib/transactions/currency";
import type { CategorySpendRow, DashboardProfile } from "@/lib/dashboard/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CHART_COLORS = ["#334155", "#71717a"];

type CategoryComparisonChartProps = {
  data: CategorySpendRow[];
  profiles: DashboardProfile[];
  profileId: string | null;
};

export function CategoryComparisonChart({
  data,
  profiles,
  profileId,
}: CategoryComparisonChartProps) {
  const profileNames = profiles.map((profile) => profile.display_name);
  const isPersonView = Boolean(profileId);
  const activeProfile = profiles.find((profile) => profile.id === profileId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isPersonView
            ? `${activeProfile?.display_name ?? "Person"} spend by category`
            : "Spend by category"}
        </CardTitle>
        <CardDescription>
          {isPersonView
            ? "Category breakdown for this person's accounts this month."
            : "Side-by-side category view across household members."}
        </CardDescription>
      </CardHeader>
      <CardContent className="h-80">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No expense data for this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 12 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={70}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `R ${value}`}
              />
              <Tooltip
                formatter={(value) => formatZar(Number(value ?? 0))}
                labelFormatter={(label) => `Category: ${label}`}
              />
              {!isPersonView ? <Legend /> : null}
              {(isPersonView ? [activeProfile?.display_name].filter(Boolean) : profileNames).map(
                (name, index) => (
                  <Bar
                    key={name}
                    dataKey={name as string}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                    radius={[4, 4, 0, 0]}
                  />
                )
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
        {!isPersonView ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {profiles.map((profile) => (
              <Link
                key={profile.id}
                href={`/dashboard/${profile.id}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                View {profile.display_name}&apos;s detail
              </Link>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
