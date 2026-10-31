// Needs a database. Skipped unless TEST_DATABASE_URL is set (see npm run test:db).
// Cross-module on purpose (agent-core + lib/services + lib/db), so it lives in
// test/. The model is ALWAYS createMockCallSarvam; fetch is blocked so a live
// Sarvam call would fail the test.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockCallSarvam, runAgent, type MockReply } from "../agent-core";
import { ModelError } from "../agent-core/model";
import type { Dispute, ModelOutput } from "../contracts";
import { cases } from "../fixtures/cases";
import { garvitCases } from "../fixtures/garvit-cases";
import { resetDatabase } from "../lib/db/test-helpers";

const TEST_URL = process.env.TEST_DATABASE_URL;
const NOW = "2026-11-05T10:00:00.000Z";
const all = [...cases, ...garvitCases];

const networkGuard = vi.fn<typeof fetch>(async () => {
  throw new Error("network access is not allowed in this test");
});

function agentDeps(reply: MockReply) {
  let n = 0;
  return { callSarvam: createMockCallSarvam(reply), now: () => new Date(NOW), createId: () => `id${++n}` };
}

describe.skipIf(!TEST_URL)("real runAgent + saveAgentRun (database)", () => {
  let disputes: typeof import("../lib/db/repositories/disputes");
  let recs: typeof import("../lib/db/repositories/recommendations");
  let approvals: typeof import("../lib/db/repositories/approvals");
  let actionLog: typeof import("../lib/db/repositories/action-log");
  let save: typeof import("../lib/services/save-agent-run").saveAgentRun;
  let prisma: typeof import("../lib/db/prisma").prisma;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    disputes = await import("../lib/db/repositories/disputes");
    recs = await import("../lib/db/repositories/recommendations");
    approvals = await import("../lib/db/repositories/approvals");
    actionLog = await import("../lib/db/repositories/action-log");
    save = (await import("../lib/services/save-agent-run")).saveAgentRun;
    prisma = (await import("../lib/db/prisma")).prisma;
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    vi.stubGlobal("fetch", networkGuard);
    vi.stubEnv("SARVAM_API_KEY", "");
    await resetDatabase();
  });
  afterEach(() => {
    expect(networkGuard).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function runAndSave(dispute: Dispute, reply: MockReply) {
    await disputes.createDisputeWithEvidence(dispute);
    // Read back from the database, as the workflow does, so seeding is part of the check.
    const stored = await disputes.getDispute(dispute.id);
    expect(stored).not.toBeNull();
    const run = await runAgent(stored!, agentDeps(reply));
    const saved = await save({
      disputeId: dispute.id,
      recommendation: run.recommendation,
      actionLog: run.actionLog,
      approval: { id: `appr_${dispute.id}`, requestedAt: NOW },
    });
    return { run, saved };
  }

  for (const { dispute, expectedAction } of all) {
    it(`${dispute.id}: saves a ${expectedAction} run with log, pending approval and awaiting_approval`, async () => {
      const reply: ModelOutput = {
        action: expectedAction,
        confidence: 0.9,
        reasoning: `Synthetic mock recommendation: ${expectedAction}.`,
        evidenceRefs: dispute.evidence.filter((e) => e.type !== "customer_message").map((e) => e.id),
      };
      const { run, saved } = await runAndSave(dispute, reply);

      expect(saved.recommendation.finalAction).toBe(expectedAction);
      expect(saved.recommendation.modelOutput).toEqual(reply);
      expect(saved.actionLog).toHaveLength(run.actionLog.length);
      expect(saved.approval).toMatchObject({ status: "pending", proposedAction: expectedAction });

      // Read back through the repositories (and so the mappers).
      expect((await disputes.getDispute(dispute.id))?.status).toBe("awaiting_approval");
      expect(await recs.getLatestRecommendation(dispute.id)).toEqual(saved.recommendation);
      expect((await approvals.getPendingApproval(dispute.id))?.recommendationId).toBe(saved.recommendation.id);
      expect((await actionLog.listActionLog(dispute.id)).map((e) => e.id)).toEqual(run.actionLog.map((e) => e.id));
    });
  }

  it("a model failure saves an escalate recommendation with null modelOutput and model_failure", async () => {
    const { dispute } = cases[0];
    const failure = new ModelError("provider_error", "Sarvam server error (HTTP 500)", { status: 500, attemptCount: 3 });
    const { saved } = await runAndSave(dispute, failure);

    expect(saved.recommendation.finalAction).toBe("escalate");
    expect(saved.recommendation.modelOutput).toBeNull();
    expect(saved.recommendation.flags).toContain("model_failure");
    expect(saved.approval).toMatchObject({ status: "pending", proposedAction: "escalate" });
    expect((await disputes.getDispute(dispute.id))?.status).toBe("awaiting_approval");

    // Panel data, read back as AgentPanel reads it.
    const latest = await recs.getLatestRecommendation(dispute.id);
    expect(latest?.modelOutput).toBeNull();
    expect(latest?.flags).toContain("model_failure");
    expect((await approvals.getPendingApproval(dispute.id))?.flags).toContain("model_failure");
    expect((await recs.getLatestRecommendations([dispute.id])).get(dispute.id)?.finalAction).toBe("escalate");
    const log = await actionLog.listActionLog(dispute.id);
    expect(log.some((e) => e.outcome.startsWith("model_failure:"))).toBe(true);
  });
});
