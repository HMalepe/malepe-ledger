import { formatZar } from "@/lib/transactions/currency";
import type { DashboardStats } from "@/lib/dashboard/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type StatCardsProps = {
  stats: DashboardStats;
  monthLabel: string;
};

const cards = [
  {
    key: "income",
    title: "Total Income",
    getValue: (stats: DashboardStats) => formatZar(stats.totalIncome),
    description: "This month",
  },
  {
    key: "expenses",
    title: "Total Expenses",
    getValue: (stats: DashboardStats) => formatZar(stats.totalExpenses),
    description: "Excludes transfers & billing errors",
  },
  {
    key: "surplus",
    title: "Surplus / Shortfall",
    getValue: (stats: DashboardStats) => formatZar(stats.surplus),
    description: "Income minus expenses",
  },
  {
    key: "owed",
    title: "Money Currently Owed",
    getValue: (stats: DashboardStats) => formatZar(stats.moneyOwed),
    description: "Unrepaid standard debts",
  },
] as const;

export function StatCards({ stats, monthLabel }: StatCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">
              {card.getValue(stats)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {card.description} · {monthLabel}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
