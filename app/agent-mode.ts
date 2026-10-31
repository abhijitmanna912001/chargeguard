import "server-only";
import { callSarvam } from "@/agent-core/model";
import { runAgent } from "@/agent-core";
import type { RunAgentDeps } from "@/lib/services/run-agent-workflow";

// The ONE place that decides whether the app uses the mock agent or the real
// one. It is also the only file that reads AGENT_MODE. (SARVAM_API_KEY is read
// inside agent-core/model, not here.) Tests never go through this file's live
// branch with the real callSarvam: they inject createMockCallSarvam instead.

export type AgentMode = "mock" | "live";

let warned = false;

/**
 * Reads AGENT_MODE on every call (never at import time) so the value is a
 * request-time one. Call it after a dynamic await inside a page, not in the
 * static shell. Unknown values fall back to "mock" with one warning per process.
 */
export function getAgentMode(): AgentMode {
  const raw = process.env.AGENT_MODE?.trim().toLowerCase();
  if (raw === undefined || raw === "" || raw === "mock") return "mock";
  if (raw === "live") return "live";
  if (!warned) {
    warned = true;
    console.warn(`AGENT_MODE="${process.env.AGENT_MODE}" is not "mock" or "live"; using "mock".`);
  }
  return "mock";
}

/** undefined in mock mode, so runAgentForDispute falls back to its mock agent. */
export function getAgentRunner(): RunAgentDeps["runAgent"] {
  if (getAgentMode() !== "live") return undefined;
  return (dispute, deps) =>
    runAgent(dispute, { callSarvam, now: () => new Date(), createId: deps.createId });
}

/** Test hook: lets a test see the one-time warning again. */
export function resetAgentModeWarningForTests(): void {
  warned = false;
}
