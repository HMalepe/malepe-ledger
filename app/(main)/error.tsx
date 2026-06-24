"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

type MainErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function MainError({ error, reset }: MainErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <div className="max-w-md space-y-2 text-center">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred while loading this page."}
        </p>
      </div>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
