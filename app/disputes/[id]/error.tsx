"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { PageShell } from "@/components/ui/PageShell";

export default function DisputeError({
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
      <ErrorState title="We couldn&apos;t load this dispute">
        <Button variant="secondary" onClick={() => retry()}>
          Try again
        </Button>
        <Link href="/disputes" className="text-sm font-medium underline underline-offset-2">
          Back to all disputes
        </Link>
      </ErrorState>
    </PageShell>
  );
}
