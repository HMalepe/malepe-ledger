"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatZar } from "@/lib/transactions/currency";
import type { RunningBalancePoint } from "@/lib/dashboard/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type RunningBalanceChartProps = {
  data: RunningBalancePoint[];
  monthLabel: string;
};

export function RunningBalanceChart({
  data,
  monthLabel,
}: RunningBalanceChartProps) {
  const minBalance = Math.min(...data.map((point) => point.balance), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Running balance trend</CardTitle>
        <CardDescription>
          Cumulative income minus cumulative expenses, day by day for {monthLabel}.
        </CardDescription>
      </CardHeader>
      <CardContent className="h-80">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No transaction data for this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={24} />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `R ${value}`}
              />
              <Tooltip
                formatter={(value) => formatZar(Number(value ?? 0))}
                labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload as RunningBalancePoint | undefined;
                  return point ? `Date: ${point.label}` : "";
                }}
              />
              <ReferenceLine y={0} stroke="#a1a1aa" strokeDasharray="4 4" />
              {minBalance < 0 ? (
                <ReferenceLine
                  y={minBalance}
                  stroke="#ef4444"
                  strokeDasharray="2 6"
                  label={{ value: "Low point", position: "insideBottomRight", fontSize: 11 }}
                />
              ) : null}
              <Line
                type="monotone"
                dataKey="balance"
                stroke="#334155"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
