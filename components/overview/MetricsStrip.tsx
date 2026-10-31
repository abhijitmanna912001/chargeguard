import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";

export function MetricsStrip() {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
      <p className="text-sm text-ink-muted">
        See how the agent did on the demo fixtures, and live counts for approvals and time to decision.
      </p>
      <Link href="/metrics" className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:text-accent-hover">
        View metrics
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </Card>
  );
}
