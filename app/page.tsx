import type { Metadata } from "next";
import { Suspense } from "react";
import { MetricsStrip } from "@/components/overview/MetricsStrip";
import { NeedsDecisionList } from "@/components/overview/NeedsDecisionList";
import { OverviewSkeleton } from "@/components/overview/OverviewSkeleton";
import { RecentActivity } from "@/components/overview/RecentActivity";
import { StatusTiles } from "@/components/overview/StatusTiles";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { listRecentActionLogPerDispute } from "@/lib/db/repositories/action-log";
import { listDisputesByStatus } from "@/lib/db/repositories/disputes";
import { countDisputesByStatus } from "@/lib/db/repositories/metrics";
import { getLatestRecommendations } from "@/lib/db/repositories/recommendations";

export const metadata: Metadata = {
  title: "Overview | ChargeGuard",
};

const RECENT_ACTIVITY_LIMIT = 8;
const RECENT_ACTIVITY_PER_DISPUTE = 2;

// The header is static and ships in the prerendered shell. Everything below it
// streams in behind Suspense. Nothing here uses "use cache": dispute status is
// never cached.
export default function OverviewPage() {
  return (
    <PageShell>
      <PageHeader
        title="Overview"
        description="What needs your attention, where every dispute stands, and what the agent has been doing."
      />
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewLoader />
      </Suspense>
    </PageShell>
  );
}

async function OverviewLoader() {
  const [awaiting, counts, activity] = await Promise.all([
    listDisputesByStatus("awaiting_approval"),
    countDisputesByStatus(),
    listRecentActionLogPerDispute(RECENT_ACTIVITY_PER_DISPUTE, RECENT_ACTIVITY_LIMIT),
  ]);
  const recommendations = await getLatestRecommendations(awaiting.map((d) => d.id));
  // Read the clock after the awaits so it is a request-time value.
  const now = new Date();
  return (
    <div className="space-y-8">
      <section aria-labelledby="needs-decision-heading" className="space-y-3">
        <h2 id="needs-decision-heading" className="text-lg font-semibold">Needs your decision</h2>
        <NeedsDecisionList disputes={awaiting} now={now} recommendations={recommendations} />
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
