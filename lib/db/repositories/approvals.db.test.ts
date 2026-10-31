// Needs a database. Skipped unless TEST_DATABASE_URL is set (see npm run test:db).
// The shared vitest alias for "server-only" is not here yet. Once it lands this
// mock can go away.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDispute, buildPendingApproval, buildRecommendation, resetDatabase } from "../test-helpers";

vi.mock("server-only", () => ({}));

const TEST_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_URL)("approvals repository (database)", () => {
  let repo: typeof import("./approvals");
  let recs: typeof import("./recommendations");
  let disputes: typeof import("./disputes");
  let errors: typeof import("../errors");
  let prisma: typeof import("../prisma").prisma;

  beforeAll(async () => {
    // prisma.ts reads DATABASE_URL at import time, so set it before importing.
    process.env.DATABASE_URL = TEST_URL;
    repo = await import("./approvals");
    recs = await import("./recommendations");
    disputes = await import("./disputes");
    errors = await import("../errors");
    prisma = (await import("../prisma")).prisma;
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    await resetDatabase();
    await disputes.createDisputeWithEvidence(buildDispute("d1"));
    await recs.createRecommendation(buildRecommendation("r1", "d1"));
    await repo.createApprovalRequest(buildPendingApproval("a1", "d1", "r1"));
  });

  it("lets exactly one of two concurrent resolves win, and stores the winner's values", async () => {
    const results = await Promise.allSettled([
      repo.resolveApproval("a1", { status: "approved", resolvedAction: "defend", decidedBy: "alice" }),
      repo.resolveApproval("a1", { status: "rejected", decidedBy: "bob" }),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      errors.ApprovalAlreadyResolvedError,
    );

    const winner = (won[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof repo.resolveApproval>>>).value;
    const row = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: "a1" } });
    expect(row.status).toBe(winner.status);
    expect(row.decidedBy).toBe(winner.decidedBy);
    expect(row.resolvedAction).toBe(winner.resolvedAction ?? null);
    expect(row.status).not.toBe("pending");
  });

  it("throws and leaves the row unchanged when already resolved", async () => {
    await repo.resolveApproval("a1", { status: "approved", resolvedAction: "defend", decidedBy: "alice" });
    const before = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: "a1" } });

    await expect(
      repo.resolveApproval("a1", { status: "rejected", decidedBy: "bob", note: "late" }),
    ).rejects.toBeInstanceOf(errors.ApprovalAlreadyResolvedError);

    const after = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: "a1" } });
    expect(after).toEqual(before);
    expect(after.decidedBy).toBe("alice");
  });
});
