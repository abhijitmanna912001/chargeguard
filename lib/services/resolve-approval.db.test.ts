// Needs a database. Skipped unless TEST_DATABASE_URL is set (see npm run test:db).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDispute, buildPendingApproval, buildRecommendation, resetDatabase } from "../db/test-helpers";

vi.mock("server-only", () => ({}));

const TEST_URL = process.env.TEST_DATABASE_URL;
const NOW = new Date("2026-11-05T12:00:00.000Z");

describe.skipIf(!TEST_URL)("resolveApprovalWorkflow (database)", () => {
  let resolve: typeof import("./resolve-approval").resolveApprovalWorkflow;
  let errors: typeof import("./errors");
  let dbErrors: typeof import("../db/errors");
  let prisma: typeof import("../db/prisma").prisma;

  const call = (over: Partial<Parameters<typeof resolve>[0]> = {}) =>
    resolve({
      disputeId: "d1",
      approvalId: "a1",
      decision: "approved",
      resolvedAction: "defend",
      decidedBy: "demo_merchant",
      now: NOW,
      createId: () => "log_1",
      ...over,
    });
  const status = async () => (await prisma.dispute.findUniqueOrThrow({ where: { id: "d1" } })).status;
  const humanLogs = () => prisma.actionLog.findMany({ where: { disputeId: "d1", actor: "human" } });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    resolve = (await import("./resolve-approval")).resolveApprovalWorkflow;
    errors = await import("./errors");
    dbErrors = await import("../db/errors");
    prisma = (await import("../db/prisma")).prisma;
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    await resetDatabase();
    const disputes = await import("../db/repositories/disputes");
    const recs = await import("../db/repositories/recommendations");
    const approvals = await import("../db/repositories/approvals");
    await disputes.createDisputeWithEvidence({ ...buildDispute("d1"), status: "awaiting_approval" });
    await recs.createRecommendation(buildRecommendation("r1", "d1"));
    await approvals.createApprovalRequest(buildPendingApproval("a1", "d1", "r1"));
  });

  it("approve + defend -> decided, one human log entry", async () => {
    const result = await call();
    expect(result.disputeStatus).toBe("decided");
    expect(await status()).toBe("decided");
    expect(result.approval).toMatchObject({ status: "approved", resolvedAction: "defend", decidedBy: "demo_merchant" });
    expect(result.approval.decidedAt).toBe(NOW.toISOString());
    const logs = await humanLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ step: "approve", actor: "human", summary: "Approved: defend" });
  });

  it("approve + accept -> accepted", async () => {
    await call({ resolvedAction: "accept" });
    expect(await status()).toBe("accepted");
    expect((await humanLogs())[0].summary).toBe("Approved: accept");
  });

  it("reject -> escalated", async () => {
    await call({ decision: "rejected", resolvedAction: undefined, note: "needs a person" });
    expect(await status()).toBe("escalated");
    const row = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: "a1" } });
    expect(row).toMatchObject({ status: "rejected", note: "needs a person" });
    expect(await humanLogs()).toHaveLength(1);
  });

  it("a second resolve throws ApprovalAlreadyResolvedError and adds no log entry", async () => {
    await call();
    await expect(call({ createId: () => "log_2" })).rejects.toBeInstanceOf(dbErrors.ApprovalAlreadyResolvedError);
    expect(await humanLogs()).toHaveLength(1);
    expect(await status()).toBe("decided");
  });

  it("rejects invalid decision shapes before touching the database", async () => {
    await expect(call({ resolvedAction: undefined })).rejects.toBeInstanceOf(errors.InvalidDecisionError);
    await expect(call({ decision: "rejected" })).rejects.toBeInstanceOf(errors.InvalidDecisionError);
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: "a1" } })).status).toBe("pending");
  });

  it("throws ApprovalDisputeMismatchError for another dispute's approval and changes nothing", async () => {
    const disputes = await import("../db/repositories/disputes");
    await disputes.createDisputeWithEvidence({ ...buildDispute("d2"), status: "awaiting_approval" });
    await expect(call({ disputeId: "d2" })).rejects.toBeInstanceOf(errors.ApprovalDisputeMismatchError);
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: "a1" } })).status).toBe("pending");
    expect(await status()).toBe("awaiting_approval");
  });

  it("rolls the approval back to pending when the dispute is not awaiting approval", async () => {
    await prisma.dispute.update({ where: { id: "d1" }, data: { status: "decided" } });
    await expect(call()).rejects.toBeInstanceOf(errors.DisputeNotReadyError);
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: "a1" } })).status).toBe("pending");
  });

  it("rolls everything back when a step after the approval update fails", async () => {
    // createId runs after the approval update and the status change.
    await expect(
      call({
        createId: () => {
          throw new Error("forced failure");
        },
      }),
    ).rejects.toThrow("forced failure");
    const row = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: "a1" } });
    expect(row).toMatchObject({ status: "pending", resolvedAction: null, decidedBy: null, decidedAt: null });
    expect(await status()).toBe("awaiting_approval");
    expect(await humanLogs()).toHaveLength(0);
  });
});
