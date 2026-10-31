import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AgentPanel } from "@/components/disputes/AgentPanel";
import { AgentPanelSkeleton } from "@/components/disputes/AgentPanelSkeleton";
import { ActionLogTimeline } from "@/components/disputes/ActionLogTimeline";
import { CaseFileSkeleton } from "@/components/disputes/CaseFileSkeleton";
import { DisputeSummary } from "@/components/disputes/DisputeSummary";
import { EvidenceSection } from "@/components/disputes/EvidenceSection";
import { getAgentMode } from "@/app/agent-mode";
import { listActionLog } from "@/lib/db/repositories/action-log";
import { getDispute } from "@/lib/db/repositories/disputes";
import { getLatestRecommendation } from "@/lib/db/repositories/recommendations";
import { resolveApprovalAction, runAgentAction, submitDefenseAction } from "./actions";

type Props = PageProps<"/disputes/[id]">;

// Only reads params (no database), so the title costs nothing extra.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Dispute ${id} | ChargeGuard` };
}

// `params` is a Promise and awaiting it is request-time work, so the page
// passes the promise down and awaits it inside Suspense. The heading and back
// link stay in the static shell. Nothing here uses "use cache".
export default function DisputeDetailPage({ params }: Props) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <Link
        href="/disputes"
        className="text-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        ← All disputes
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold tracking-tight">Dispute details</h1>
      <Suspense fallback={<CaseFileSkeleton />}>
        <CaseFile params={params} />
      </Suspense>
    </main>
  );
}

async function CaseFile({ params }: { params: Props["params"] }) {
  const { id } = await params;
  const [dispute, actionLog, recommendation] = await Promise.all([
    getDispute(id),
    listActionLog(id),
    getLatestRecommendation(id),
  ]);
  if (!dispute) {
    notFound();
  }
  // Read the clock after the awaits so it is a request-time value.
  const now = new Date();
  const isMockAgent = getAgentMode() === "mock";
  return (
    <>
      <DisputeSummary dispute={dispute} now={now} recommendation={recommendation} isMockAgent={isMockAgent} />
      <Suspense fallback={<AgentPanelSkeleton />}>
        <AgentPanel
          disputeId={dispute.id}
          runAgent={runAgentAction}
          resolveApproval={resolveApprovalAction}
          submitDefense={submitDefenseAction}
          isMockAgent={isMockAgent}
        />
      </Suspense>
      <EvidenceSection evidence={dispute.evidence} />
      <ActionLogTimeline entries={actionLog} />
    </>
  );
}
