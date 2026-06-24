import { formatZar } from "@/lib/transactions/currency";
import type { DaysToZeroResult } from "@/lib/dashboard/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type DaysToZeroWidgetProps = {
  results: DaysToZeroResult[];
};

export function DaysToZeroWidget({ results }: DaysToZeroWidgetProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Days to threshold</CardTitle>
        <CardDescription>
          Days into the pay cycle before each account&apos;s projected balance
          drops below its threshold (default R 200.00).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts found.</p>
        ) : (
          results.map((result) => (
            <div
              key={result.accountId}
              className="rounded-lg border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{result.accountName}</p>
                  <p className="text-xs text-muted-foreground">
                    {result.ownerDisplayName}
                  </p>
                </div>
                {result.configured && result.daysIntoCycle !== null ? (
                  <Badge variant="outline">Day {result.daysIntoCycle}</Badge>
                ) : result.configured ? (
                  <Badge variant="secondary">Above threshold</Badge>
                ) : (
                  <Badge variant="outline">Not configured</Badge>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{result.message}</p>
              {result.configured ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Threshold: {formatZar(result.threshold)}
                  {result.cycleStartDate
                    ? ` · Cycle started ${result.cycleStartDate}`
                    : null}
                </p>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
