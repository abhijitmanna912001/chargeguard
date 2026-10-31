"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/components/ui/PageShell";

export default function DisputesError({
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
      <div role="alert" className="rounded-lg border border-danger-line bg-danger-bg p-6 text-danger-fg">
        <h2 className="text-lg font-semibold">We couldn&apos;t load the disputes</h2>
        <p className="mt-1 text-sm">
          Something went wrong on our side. Your data is safe. Please try again in a moment.
        </p>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => retry()}>
            Try again
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
