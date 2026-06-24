"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { AlertCircle, History, MessageCircle, RefreshCw } from "lucide-react";

import {
  askAboutMonth,
  generateDeepHistoryInsights,
  generateMonthlyInsights,
} from "@/lib/actions/insights";
import { formatZar } from "@/lib/transactions/currency";
import type { CachedInsight, InsightsPageData } from "@/lib/insights/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type InsightsPageClientProps = InsightsPageData;

function formatGeneratedAt(value: string | null | undefined): string {
  if (!value) return "Never";
  return format(new Date(value), "dd MMM yyyy, HH:mm");
}

export function InsightsPageClient(props: InsightsPageClientProps) {
  const router = useRouter();
  const [displayInsight, setDisplayInsight] = useState<CachedInsight | null>(
    props.cached
  );
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeepHistory, setIsDeepHistory] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  useEffect(() => {
    setDisplayInsight(props.cached);
    setError(null);
    setAnswer(null);
    setQuestion("");
  }, [props.cached, props.selectedMonth]);

  const topComparisons = useMemo(
    () => props.monthComparisons.slice(0, 5),
    [props.monthComparisons]
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    setError(null);

    const result = await generateMonthlyInsights(
      props.householdId,
      props.selectedMonth,
      { force: true }
    );

    setIsRefreshing(false);

    if (!result.success) {
      setError(result.error);
      if (result.lastSuccessful) {
        setDisplayInsight(result.lastSuccessful);
      }
      return;
    }

    setDisplayInsight(result.insight);
    router.refresh();
  }

  async function handleDeepHistory() {
    if (
      !window.confirm(
        "Deep history uses up to 6 months of data and costs more tokens. Continue?"
      )
    ) {
      return;
    }

    setIsDeepHistory(true);
    setError(null);

    const result = await generateDeepHistoryInsights(
      props.householdId,
      props.selectedMonth,
      6
    );

    setIsDeepHistory(false);

    if (!result.success) {
      setError(result.error);
      if (result.lastSuccessful) setDisplayInsight(result.lastSuccessful);
      return;
    }

    setDisplayInsight(result.insight);
    router.refresh();
  }

  async function handleAsk(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAsking(true);
    setError(null);
    setAnswer(null);

    const result = await askAboutMonth({
      householdId: props.householdId,
      month: props.selectedMonth,
      question,
    });

    setIsAsking(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setAnswer(result.answer);
    router.refresh();
  }

  const showStaleNotice = Boolean(error && displayInsight);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{props.monthLabel}</p>
          <p className="text-xs text-muted-foreground">
            AI budget: R {(props.costUsedCents / 100).toFixed(2)} / R{" "}
            {(props.costCeilingCents / 100).toFixed(2)} this month
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeepHistory}
            disabled={isDeepHistory || props.costLimitReached}
          >
            <History />
            View deep history
          </Button>
          <Button
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing || props.costLimitReached}
          >
            <RefreshCw className={isRefreshing ? "animate-spin" : undefined} />
            Refresh insights
          </Button>
        </div>
      </div>

      {props.costLimitReached ? (
        <Alert variant="destructive">
          <AlertTitle>Monthly AI budget reached</AlertTitle>
          <AlertDescription>
            New insights and questions are paused until next month. Cached
            insights remain visible below.
          </AlertDescription>
        </Alert>
      ) : null}

      {showStaleNotice ? (
        <Alert>
          <AlertCircle />
          <AlertTitle>Could not refresh insights</AlertTitle>
          <AlertDescription>
            {error} Showing last successful insight from{" "}
            {formatGeneratedAt(displayInsight?.generated_at)}.
          </AlertDescription>
        </Alert>
      ) : null}

      {!displayInsight && !error ? (
        <Card>
          <CardHeader>
            <CardTitle>No insights yet for {props.monthLabel}</CardTitle>
            <CardDescription>
              Insights are cached after generation. Click Refresh insights to
              generate the first summary for this month.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {error && !displayInsight ? (
        <Alert variant="destructive">
          <AlertTitle>Generation failed</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{error}</p>
            <Button size="sm" variant="outline" onClick={handleRefresh}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {displayInsight ? (
        <>
          <p className="text-xs text-muted-foreground">
            Last updated: {formatGeneratedAt(displayInsight.generated_at)}
          </p>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Income (computed)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold">
                  {formatZar(displayInsight.income_total)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Expenses (computed)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold">
                  {formatZar(displayInsight.expense_total)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Surplus (computed)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold">
                  {formatZar(displayInsight.surplus)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Monthly summary</CardTitle>
              <CardDescription>
                Narrative from AI — all figures above are computed in code.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">
                {displayInsight.ai_summary ?? "No summary available."}
              </p>
            </CardContent>
          </Card>

          {displayInsight.ai_flags.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Flags</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  {displayInsight.ai_flags.map((flag) => (
                    <li key={flag}>{flag}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>This time last month</CardTitle>
          <CardDescription>
            Category comparisons for {props.priorMonthLabel} vs {props.monthLabel}{" "}
            — computed in code, not by AI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {topComparisons.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Not enough data for month-over-month comparisons.
            </p>
          ) : (
            topComparisons.map((row) => (
              <div
                key={row.category}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <span className="font-medium">{row.category}</span>
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <span>
                    This time last month you spent {formatZar(row.prior_amount)} on{" "}
                    {row.category.toLowerCase()}.
                  </span>
                  <span>Now: {formatZar(row.current_amount)}.</span>
                  {row.change_pct !== null ? (
                    <Badge variant="outline">
                      {row.change_pct > 0 ? "+" : ""}
                      {row.change_pct}%
                    </Badge>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="size-4" />
            Ask about this month
          </CardTitle>
          <CardDescription>
            Free-form questions use the same cached JSON summary as context (2-month
            window by default).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAsk} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="insight-question">Your question</Label>
              <Input
                id="insight-question"
                placeholder='e.g. "Why did we spend more on fuel?"'
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                disabled={isAsking || props.costLimitReached}
              />
            </div>
            <Button
              type="submit"
              disabled={isAsking || !question.trim() || props.costLimitReached}
            >
              {isAsking ? "Thinking…" : "Ask"}
            </Button>
          </form>
          {answer ? (
            <div className="mt-4 rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed">
              {answer}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
