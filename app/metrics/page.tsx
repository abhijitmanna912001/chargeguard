import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { EvalSection } from "@/components/metrics/EvalSection";
import { MetricsSkeleton } from "@/components/metrics/MetricsSkeleton";
import { OperationsSection } from "@/components/metrics/OperationsSection";
import { loadEvalResults } from "@/lib/eval/load-results";
import { getOperationalMetrics } from "@/lib/metrics/operations";

export const metadata: Metadata = {
  title: "Metrics | ChargeGuard",
};

// Headings and notes are static and ship in the prerendered shell. Both data
// sections stream in behind their own Suspense: the eval file is read with an
// async readFile (request time) and the operations numbers come from the
// database. Nothing here uses "use cache".
export default function MetricsPage() {
  return (
    <PageShell>
      <PageHeader title="Metrics" />

      <div className="space-y-12">
        <section aria-labelledby="eval-heading">
          <h2 id="eval-heading" className="text-lg font-semibold">Agent evaluation (synthetic demo data)</h2>
          <p className="mt-1 mb-4 max-w-3xl text-sm text-ink-muted">
            These results come from five synthetic demo fixtures, not from real disputes. They show how the agent behaved
            on those five cases and are not a measure of general accuracy.
          </p>
          <Suspense fallback={<MetricsSkeleton label="Loading evaluation results…" />}>
            <EvalLoader />
          </Suspense>
        </section>

        <section aria-labelledby="ops-heading">
          <h2 id="ops-heading" className="text-lg font-semibold">Live operations</h2>
          <p className="mt-1 mb-4 text-sm text-ink-muted">
            Counts from the database, read fresh on every load.
          </p>
          <Suspense fallback={<MetricsSkeleton label="Loading live operations…" />}>
            <OperationsLoader />
          </Suspense>
        </section>
      </div>
    </PageShell>
  );
}

async function EvalLoader() {
  return <EvalSection result={await loadEvalResults()} />;
}

async function OperationsLoader() {
  return <OperationsSection metrics={await getOperationalMetrics()} />;
}
