import type { Metadata } from "next";
import { Suspense } from "react";
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
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Metrics</h1>

      <section aria-labelledby="eval-heading" className="mt-8">
        <h2 id="eval-heading" className="text-lg font-semibold">Agent evaluation (synthetic demo data)</h2>
        <p className="mt-1 mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          These results come from five synthetic demo fixtures, not from real disputes. They show how the agent behaved
          on those five cases and are not a measure of general accuracy.
        </p>
        <Suspense fallback={<MetricsSkeleton label="Loading evaluation results…" />}>
          <EvalLoader />
        </Suspense>
      </section>

      <section aria-labelledby="ops-heading" className="mt-12">
        <h2 id="ops-heading" className="text-lg font-semibold">Live operations</h2>
        <p className="mt-1 mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Counts from the database, read fresh on every load.
        </p>
        <Suspense fallback={<MetricsSkeleton label="Loading live operations…" />}>
          <OperationsLoader />
        </Suspense>
      </section>
    </main>
  );
}

async function EvalLoader() {
  return <EvalSection result={await loadEvalResults()} />;
}

async function OperationsLoader() {
  return <OperationsSection metrics={await getOperationalMetrics()} />;
}
