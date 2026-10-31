import type { Metadata } from "next";
import { Suspense } from "react";
import { DisputeTable } from "@/components/disputes/DisputeTable";
import { TableSkeleton } from "@/components/disputes/TableSkeleton";
import { getAgentMode } from "@/app/agent-mode";
import { listDisputes } from "@/lib/db/repositories/disputes";
import { getLatestRecommendations } from "@/lib/db/repositories/recommendations";

export const metadata: Metadata = {
  title: "Disputes | ChargeGuard",
};

// The heading is static and ships in the prerendered shell. The table streams
// in behind Suspense. Nothing here uses "use cache": dispute data is never cached.
export default function DisputesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Disputes</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        The recommended next action for each dispute, from the agent&apos;s latest run.
      </p>
      <Suspense fallback={<TableSkeleton />}>
        <DisputeTableLoader />
      </Suspense>
    </main>
  );
}

async function DisputeTableLoader() {
  const disputes = await listDisputes();
  const recommendations = await getLatestRecommendations(disputes.map((d) => d.id));
  // Read the clock and the agent mode after the awaits so they are request-time
  // values, not ones frozen into the static shell.
  const now = new Date();
  const isMockAgent = getAgentMode() === "mock";
  return <DisputeTable disputes={disputes} now={now} recommendations={recommendations} isMockAgent={isMockAgent} />;
}
