import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageShell } from "@/components/ui/PageShell";
import { AgentPanel } from "@/components/disputes/AgentPanel";
import { AgentPanelSkeleton } from "@/components/disputes/AgentPanelSkeleton";
import { ActionLogTimeline } from "@/components/disputes/ActionLogTimeline";
import { CaseFileSkeleton } from "@/components/disputes/CaseFileSkeleton";
import { DisputeSummary } from "@/components/disputes/DisputeSummary";
import { EvidenceSection } from "@/components/disputes/EvidenceSection";
import { getAgentMode } from "@/app/agent-mode";
import { listActionLog } from "@/lib/db/repositories/action-log";
import { getDispute } from "@/lib/db/repositories/disputes";
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
    <PageShell>
      <Link href="/disputes" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover">
        <ArrowLeft aria-hidden="true" className="size-4" />
        All disputes
      </Link>
      <PageHeader title="Dispute details" />
      <Suspense fallback={<CaseFileSkeleton />}>
        <CaseFile params={params} />
      </Suspense>
    </PageShell>
  );
}

async function CaseFile({ params }: { params: Props["params"] }) {
  const { id } = await params;
  const [dispute, actionLog] = await Promise.all([getDispute(id), listActionLog(id)]);
  if (!dispute) {
    notFound();
  }
  // Read the clock after the awaits so it is a request-time value.
  const now = new Date();
  const isMockAgent = getAgentMode() === "mock";
  return (
    <div className="space-y-8">
      <DisputeSummary dispute={dispute} now={now} />
      {/* From lg: agent, decision and evidence on the left, the action log beside them. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-8">
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
        </div>
        <div className="min-w-0">
          <ActionLogTimeline entries={actionLog} />
        </div>
      </div>
    </div>
  );
}
