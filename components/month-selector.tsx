"use client";

import { addMonths, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setViewingMonth } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";

type MonthSelectorProps = {
  monthKey: string;
  monthLabel: string;
  onError?: (message: string) => void;
};

export function MonthSelector({
  monthKey,
  monthLabel,
  onError,
}: MonthSelectorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);

  function navigate(delta: number) {
    const next = format(addMonths(parseISO(monthKey), delta), "yyyy-MM-dd");

    startTransition(async () => {
      setLocalError(null);
      const result = await setViewingMonth(next);
      if (result.success) {
        router.refresh();
        return;
      }

      setLocalError(result.error);
      onError?.(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={isPending}
          onClick={() => navigate(-1)}
          aria-label="Previous month"
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-[8.5rem] text-center text-sm font-medium">
          {monthLabel}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={isPending}
          onClick={() => navigate(1)}
          aria-label="Next month"
        >
          <ChevronRight />
        </Button>
      </div>
      {localError ? (
        <p className="max-w-[14rem] text-right text-xs text-destructive">
          {localError}
        </p>
      ) : null}
    </div>
  );
}
