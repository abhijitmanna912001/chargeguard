// Needs a database. Skipped unless TEST_DATABASE_URL is set (see npm run test:db).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cases } from "../../fixtures/cases";
import { buildDispute, resetDatabase } from "../db/test-helpers";
import { runMockAgent } from "../mock/run-agent";

vi.mock("server-only", () => ({}));

const TEST_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_URL)("saveAgentRun (database)", () => {
  let save: typeof import("./save-agent-run").saveAgentRun;
  let errors: typeof import("./errors");
  let prisma: typeof import("../db/prisma").prisma;
  let disputes: typeof import("../db/repositories/disputes");

  const dispute = cases[0].dispute;
  const run = () => {
    let n = 0;
    return runMockAgent(dispute, { now: () => new Date("2026-11-05T10:00:00.000Z"), createId: () => `id_${++n}` });
  };
  const approval = { id: "appr_1", requestedAt: "2026-11-05T10:00:01.000Z" };
  const counts = async () => ({
    recommendations: await prisma.recommendation.count(),
    logs: await prisma.actionLog.count(),
    approvals: await prisma.approvalRequest.count(),
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    save = (await import("./save-agent-run")).saveAgentRun;
    errors = await import("./errors");
    prisma = (await import("../db/prisma")).prisma;
    disputes = await import("../db/repositories/disputes");
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    await resetDatabase();
    await disputes.createDisputeWithEvidence(dispute);
  });

  it("happy path saves everything and awaits approval", async () => {
    const { recommendation, actionLog } = run();
    const saved = await save({ disputeId: dispute.id, recommendation, actionLog, approval });

    expect(await counts()).toEqual({ recommendations: 1, logs: actionLog.length, approvals: 1 });
    const row = await prisma.approvalRequest.findFirstOrThrow();
    expect(row).toMatchObject({
      status: "pending",
      recommendationId: recommendation.id,
      proposedAction: recommendation.finalAction,
      flags: recommendation.flags,
    });
    expect((await disputes.getDispute(dispute.id))?.status).toBe("awaiting_approval");
    expect(saved.approval.status).toBe("pending");
  });

  it("also accepts a dispute in gathering", async () => {
    await disputes.updateDisputeStatus(dispute.id, "gathering");
    const { recommendation, actionLog } = run();
    await save({ disputeId: dispute.id, recommendation, actionLog, approval });
    expect((await disputes.getDispute(dispute.id))?.status).toBe("awaiting_approval");
  });

  it("rolls back everything when the last log entry is invalid", async () => {
    const { recommendation, actionLog } = run();
    const bad = { ...actionLog[3], step: "bogus" } as unknown as (typeof actionLog)[number];
    await expect(
      save({ disputeId: dispute.id, recommendation, actionLog: [...actionLog.slice(0, 3), bad], approval }),
    ).rejects.toThrow();

    expect(await counts()).toEqual({ recommendations: 0, logs: 0, approvals: 0 });
    expect((await disputes.getDispute(dispute.id))?.status).toBe("received");
  });

  it("throws the typed error on a second call and saves nothing more", async () => {
    const { recommendation, actionLog } = run();
    await save({ disputeId: dispute.id, recommendation, actionLog, approval });

    const again = run();
    await expect(
      save({
        disputeId: dispute.id,
        recommendation: { ...again.recommendation, id: "rec_2" },
        actionLog: again.actionLog.map((e) => ({ ...e, id: `${e.id}_b` })),
        approval: { ...approval, id: "appr_2" },
      }),
    ).rejects.toBeInstanceOf(errors.DisputeNotReadyError);
    expect(await counts()).toEqual({ recommendations: 1, logs: actionLog.length, approvals: 1 });
  });

  it("throws DisputeNotFoundError for an unknown dispute", async () => {
    const other = buildDispute("nope");
    const r = runMockAgent(other, { now: () => new Date("2026-11-05T10:00:00.000Z") });
    await expect(
      save({ disputeId: "nope", recommendation: r.recommendation, actionLog: r.actionLog, approval }),
    ).rejects.toBeInstanceOf(errors.DisputeNotFoundError);
  });

  it("rejects items that belong to another dispute before touching the database", async () => {
    const { recommendation, actionLog } = run();
    await expect(
      save({ disputeId: "someone_else", recommendation, actionLog, approval }),
    ).rejects.toBeInstanceOf(errors.AgentRunMismatchError);
    expect(await counts()).toEqual({ recommendations: 0, logs: 0, approvals: 0 });
  });
});
