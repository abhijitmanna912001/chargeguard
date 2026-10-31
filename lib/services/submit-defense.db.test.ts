// Needs a database. Skipped unless TEST_DATABASE_URL is set (see npm run test:db).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cases } from "../../fixtures/cases";
import type { ApprovalRequest, Dispute } from "../../contracts";
import type { ProviderResult, SubmitDefenseInput } from "../integrations/paytm-client";
import { buildRecommendation, resetDatabase } from "../db/test-helpers";

vi.mock("server-only", () => ({}));

const TEST_URL = process.env.TEST_DATABASE_URL;
const NOW = new Date("2026-11-05T12:00:00.000Z");
const dispute: Dispute = { ...cases[0].dispute, status: "decided" };
const approved: ApprovalRequest = {
  id: "a1",
  disputeId: dispute.id,
  recommendationId: "r1",
  requestedAt: "2026-11-03T00:00:00.000Z",
  flags: [],
  proposedAction: "defend",
  status: "approved",
  resolvedAction: "defend",
  decidedBy: "demo_merchant",
  decidedAt: "2026-11-04T00:00:00.000Z",
};

describe.skipIf(!TEST_URL)("submitDefense (database)", () => {
  let submit: typeof import("./submit-defense").submitDefense;
  let errors: typeof import("./errors");
  let prisma: typeof import("../db/prisma").prisma;
  let n = 0;

  const ok = (): ProviderResult => ({ ok: true, providerRef: "sim_ref_1" });
  const fakeProvider = (...results: ProviderResult[]) => {
    let calls = 0;
    return vi.fn<(input: SubmitDefenseInput) => Promise<ProviderResult>>(async () => results[Math.min(calls++, results.length - 1)]);
  };
  const run = (provider: ReturnType<typeof fakeProvider>) =>
    submit(dispute.id, { now: () => NOW, createId: () => `id_${++n}`, submitToProvider: provider });
  const status = async () => (await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).status;
  const submitLogs = () => prisma.actionLog.findMany({ where: { disputeId: dispute.id, step: "submit" } });

  async function seed(over: { status?: Dispute["status"]; approval?: Partial<ApprovalRequest> | null } = {}) {
    const disputes = await import("../db/repositories/disputes");
    const recs = await import("../db/repositories/recommendations");
    const approvals = await import("../db/repositories/approvals");
    await disputes.createDisputeWithEvidence({ ...dispute, status: over.status ?? "decided" });
    await recs.createRecommendation({ ...buildRecommendation("r1", dispute.id), modelOutput: null });
    if (over.approval !== null) await approvals.createApprovalRequest({ ...approved, ...over.approval });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    submit = (await import("./submit-defense")).submitDefense;
    errors = await import("./errors");
    prisma = (await import("../db/prisma")).prisma;
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    n = 0;
    await resetDatabase();
  });

  it("happy path: dispute submitted, one submitted row, one submit log", async () => {
    await seed();
    const provider = fakeProvider(ok());
    const result = await run(provider);

    expect(result.alreadySubmitted).toBe(false);
    expect(result.submission).toMatchObject({ status: "submitted", providerRef: "sim_ref_1" });
    expect(await status()).toBe("submitted");
    const rows = await prisma.submission.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "submitted", idempotencyKey: "defense:disp_demo_001:a1" });
    const logs = await submitLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actor: "system", outcome: "submitted" });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0][0]).toMatchObject({
      idempotencyKey: "defense:disp_demo_001:a1",
      package: { disputeId: dispute.id, amountPaise: dispute.amount },
    });
  });

  it("replay returns the same row and the provider is called once in total", async () => {
    await seed();
    const provider = fakeProvider(ok());
    const first = await run(provider);
    const second = await run(provider);

    expect(second.alreadySubmitted).toBe(true);
    expect(second.submission.id).toBe(first.submission.id);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(await submitLogs()).toHaveLength(1);
  });

  it("provider failure: failed row, dispute still decided, failed log; a retry can succeed", async () => {
    await seed();
    const provider = fakeProvider({ ok: false, retryable: true, message: "unavailable" }, ok());

    await expect(run(provider)).rejects.toBeInstanceOf(errors.ProviderSubmissionFailedError);
    expect(await status()).toBe("decided");
    expect((await prisma.submission.findMany())[0]).toMatchObject({ status: "failed", errorMessage: "unavailable" });
    expect((await submitLogs()).map((l) => l.outcome)).toEqual(["failed"]);

    const retry = await run(provider);
    expect(retry.submission.status).toBe("submitted");
    expect(retry.submission.errorMessage).toBeUndefined();
    expect(await status()).toBe("submitted");
    expect(await prisma.submission.count()).toBe(1);
    expect((await submitLogs()).map((l) => l.outcome).sort()).toEqual(["failed", "submitted"]);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("a provider that throws is recorded as a failed submission", async () => {
    await seed();
    const provider = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(
      submit(dispute.id, { now: () => NOW, createId: () => `id_${++n}`, submitToProvider: provider }),
    ).rejects.toBeInstanceOf(errors.ProviderSubmissionFailedError);
    expect((await prisma.submission.findMany())[0].status).toBe("failed");
  });

  it.each([
    ["status is not decided", { status: "awaiting_approval" as const }, "status_not_decided"],
    ["there is no approval", { approval: null }, "no_approval"],
    ["the approval is rejected", { approval: { status: "rejected" as const, resolvedAction: undefined } }, "approval_not_approved"],
    ["the resolved action is accept", { approval: { resolvedAction: "accept" as const } }, "action_not_defend"],
  ])("throws and never calls the provider when %s", async (_name, over, reason) => {
    await seed(over);
    const provider = fakeProvider(ok());
    await expect(run(provider)).rejects.toMatchObject({ name: "SubmissionNotAllowedError", reason });
    expect(provider).not.toHaveBeenCalled();
    expect(await prisma.submission.count()).toBe(0);
  });

  it("throws DisputeNotFoundError for an unknown dispute", async () => {
    const provider = fakeProvider(ok());
    await expect(run(provider)).rejects.toBeInstanceOf(errors.DisputeNotFoundError);
    expect(provider).not.toHaveBeenCalled();
  });

  it("two concurrent calls leave one submitted row, one status change and one log", async () => {
    await seed();
    const provider = fakeProvider(ok());
    const [a, b] = await Promise.all([run(provider), run(provider)]);

    expect(a.submission.id).toBe(b.submission.id);
    expect([a.alreadySubmitted, b.alreadySubmitted].sort()).toEqual([false, true]);
    expect(await prisma.submission.count({ where: { status: "submitted" } })).toBe(1);
    expect(await prisma.submission.count()).toBe(1);
    expect(await status()).toBe("submitted");
    expect(await submitLogs()).toHaveLength(1);
  });
});
