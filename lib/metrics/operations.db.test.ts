// Needs a database. Skipped unless TEST_DATABASE_URL is set (see npm run test:db).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionLogEntry } from "../../contracts";
import { buildDispute, buildPendingApproval, buildRecommendation, resetDatabase } from "../db/test-helpers";

vi.mock("server-only", () => ({}));

const TEST_URL = process.env.TEST_DATABASE_URL;

const log = (id: string, disputeId: string, timestamp: string, step: ActionLogEntry["step"], actor: ActionLogEntry["actor"]): ActionLogEntry => ({
  id, disputeId, timestamp, step, actor, summary: id, evidenceRefs: [], outcome: "ok",
});

describe.skipIf(!TEST_URL)("operational metrics (database)", () => {
  let ops: typeof import("./operations");
  let disputes: typeof import("../db/repositories/disputes");
  let recs: typeof import("../db/repositories/recommendations");
  let approvals: typeof import("../db/repositories/approvals");
  let actionLog: typeof import("../db/repositories/action-log");
  let prisma: typeof import("../db/prisma").prisma;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    ops = await import("./operations");
    disputes = await import("../db/repositories/disputes");
    recs = await import("../db/repositories/recommendations");
    approvals = await import("../db/repositories/approvals");
    actionLog = await import("../db/repositories/action-log");
    prisma = (await import("../db/prisma")).prisma;
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    await resetDatabase();
  });

  it("returns zeros and null timings on an empty database", async () => {
    const m = await ops.getOperationalMetrics();
    expect(m.totalDisputes).toBe(0);
    expect(m.disputesByStatus).toHaveLength(8);
    expect(m.disputesByStatus.every((r) => r.count === 0)).toBe(true);
    expect(m.approvalsByOutcome.every((r) => r.count === 0)).toBe(true);
    expect(m.timeToDecision).toEqual({ count: 0, medianSeconds: null, maxSeconds: null });
  });

  it("counts statuses and approval outcomes and times first entry to human approve", async () => {
    for (const [id, status] of [["d1", "submitted"], ["d2", "submitted"], ["d3", "awaiting_approval"], ["d4", "received"]] as const) {
      await disputes.createDisputeWithEvidence({ ...buildDispute(id), status });
    }
    for (const id of ["d1", "d2", "d3"]) await recs.createRecommendation(buildRecommendation(`r_${id}`, id));
    await approvals.createApprovalRequest(buildPendingApproval("a1", "d1", "r_d1"));
    await approvals.createApprovalRequest(buildPendingApproval("a2", "d2", "r_d2"));
    await approvals.createApprovalRequest(buildPendingApproval("a3", "d3", "r_d3"));
    await approvals.resolveApproval("a1", { status: "approved", resolvedAction: "defend", decidedBy: "alice" });
    await approvals.resolveApproval("a2", { status: "rejected", decidedBy: "alice" });

    // d1: 100 s from first entry to the human approve. d2: 40 s. d3: no human entry yet.
    await actionLog.appendActionLog(log("l1", "d1", "2026-11-05T10:00:00.000Z", "detect", "system"));
    await actionLog.appendActionLog(log("l2", "d1", "2026-11-05T10:00:30.000Z", "decide", "agent"));
    await actionLog.appendActionLog(log("l3", "d1", "2026-11-05T10:01:40.000Z", "approve", "human"));
    await actionLog.appendActionLog(log("l4", "d2", "2026-11-05T11:00:00.000Z", "detect", "system"));
    await actionLog.appendActionLog(log("l5", "d2", "2026-11-05T11:00:40.000Z", "approve", "human"));
    await actionLog.appendActionLog(log("l6", "d3", "2026-11-05T12:00:00.000Z", "detect", "system"));
    await actionLog.appendActionLog(log("l7", "d3", "2026-11-05T12:00:05.000Z", "approve", "agent")); // not human: ignored

    const m = await ops.getOperationalMetrics();
    expect(m.totalDisputes).toBe(4);
    const count = (s: string) => m.disputesByStatus.find((r) => r.status === s)?.count;
    expect(count("submitted")).toBe(2);
    expect(count("awaiting_approval")).toBe(1);
    expect(count("received")).toBe(1);
    expect(count("expired")).toBe(0);
    expect(m.approvalsByOutcome).toEqual([
      { outcome: "pending", count: 1 },
      { outcome: "approved_defend", count: 1 },
      { outcome: "approved_accept", count: 0 },
      { outcome: "rejected", count: 1 },
    ]);
    expect(m.timeToDecision).toEqual({ count: 2, medianSeconds: 70, maxSeconds: 100 });
  });
});
