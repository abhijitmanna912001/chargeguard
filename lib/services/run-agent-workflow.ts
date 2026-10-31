// Loads a dispute, runs the agent, saves the run. Expected failures come back
// as { ok: false, reason }; unexpected ones (database down, bugs) still throw.
import type { ActionLogEntry, ApprovalRequest, Dispute, Recommendation } from "../../contracts";
import { getDispute } from "../db/repositories/disputes";
// The ONLY import of the mock agent. services/ may not import agent-core, so the
// real runAgent() is swapped in through deps.runAgent (wired up in app/), after
// which this import and lib/mock can be deleted.
import { runMockAgent } from "../mock/run-agent";
import { DisputeNotFoundError, DisputeNotReadyError } from "./errors";
import { saveAgentRun } from "./save-agent-run";

export type AgentRunOutput = { recommendation: Recommendation; actionLog: ActionLogEntry[] };

export type RunAgentDeps = {
  now: () => Date;
  createId: () => string;
  /** Defaults to the mock agent. */
  runAgent?: (dispute: Dispute, deps: { now: () => Date; createId: () => string }) => AgentRunOutput | Promise<AgentRunOutput>;
};

export type RunAgentResult =
  | { ok: true; recommendation: Recommendation; actionLog: ActionLogEntry[]; approval: ApprovalRequest }
  | { ok: false; reason: "not_found" | "not_ready" };

const RUNNABLE_STATUSES: readonly string[] = ["received", "gathering"];

export async function runAgentForDispute(disputeId: string, deps: RunAgentDeps): Promise<RunAgentResult> {
  const dispute = await getDispute(disputeId);
  if (!dispute) return { ok: false, reason: "not_found" };
  // Cheap early exit; saveAgentRun re-checks atomically, so this is not the guard.
  if (!RUNNABLE_STATUSES.includes(dispute.status)) return { ok: false, reason: "not_ready" };

  const run = await (deps.runAgent ?? runMockAgent)(dispute, deps);
  try {
    const saved = await saveAgentRun({
      disputeId,
      recommendation: run.recommendation,
      actionLog: run.actionLog,
      approval: { id: deps.createId(), requestedAt: deps.now().toISOString() },
    });
    return { ok: true, ...saved };
  } catch (err) {
    // Lost a race with another run, or the dispute vanished between read and save.
    if (err instanceof DisputeNotReadyError) return { ok: false, reason: "not_ready" };
    if (err instanceof DisputeNotFoundError) return { ok: false, reason: "not_found" };
    throw err;
  }
}
