"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageShell } from "@/components/ui/PageShell";

export default function RootError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageShell>
      <ErrorState title="We couldn&apos;t load this page">
        <Button variant="secondary" onClick={() => retry()}>
          Try again
        </Button>
      </ErrorState>
    </PageShell>
  );
}
