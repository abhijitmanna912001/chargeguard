import type { Metadata } from "next";
import { Suspense } from "react";
import { MetricsStrip } from "@/components/overview/MetricsStrip";
import { NeedsDecisionList } from "@/components/overview/NeedsDecisionList";
import { OverviewSkeleton } from "@/components/overview/OverviewSkeleton";
import { RecentActivity } from "@/components/overview/RecentActivity";
import { StatusTiles } from "@/components/overview/StatusTiles";
import { PageHeader } from "@/components/ui/PageHeader";
import { listRecentActionLog } from "@/lib/db/repositories/action-log";
import { listDisputesByStatus } from "@/lib/db/repositories/disputes";
import { countDisputesByStatus } from "@/lib/db/repositories/metrics";

export const metadata: Metadata = {
  title: "Overview | ChargeGuard",
};

const RECENT_ACTIVITY_LIMIT = 8;

// The header is static and ships in the prerendered shell. Everything below it
// streams in behind Suspense. Nothing here uses "use cache": dispute status is
// never cached.
export default function OverviewPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Overview"
        description="What needs your attention, where every dispute stands, and what the agent has been doing."
      />
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewLoader />
      </Suspense>
    </main>
  );
}

async function OverviewLoader() {
  const [awaiting, counts, activity] = await Promise.all([
    listDisputesByStatus("awaiting_approval"),
    countDisputesByStatus(),
    listRecentActionLog(RECENT_ACTIVITY_LIMIT),
  ]);
  // Read the clock after the awaits so it is a request-time value.
  const now = new Date();
  return (
    <div className="space-y-8">
      <section aria-labelledby="needs-decision-heading" className="space-y-3">
        <h2 id="needs-decision-heading" className="text-lg font-semibold">Needs your decision</h2>
        <NeedsDecisionList disputes={awaiting} now={now} />
      </section>
      <section aria-labelledby="status-heading" className="space-y-3">
        <h2 id="status-heading" className="text-lg font-semibold">Disputes by status</h2>
        <StatusTiles counts={counts} />
      </section>
      <section aria-labelledby="activity-heading" className="space-y-3">
        <h2 id="activity-heading" className="text-lg font-semibold">Recent agent activity</h2>
        <RecentActivity entries={activity} />
      </section>
      <MetricsStrip />
    </div>
  );
}
