// Needs a database. Skipped unless TEST_DATABASE_URL is set (see npm run test:db).
// The shared vitest alias for "server-only" is not here yet. Once it lands this
// mock can go away.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDispute, resetDatabase } from "../test-helpers";

vi.mock("server-only", () => ({}));

const TEST_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_URL)("submissions repository (database)", () => {
  let repo: typeof import("./submissions");
  let disputes: typeof import("./disputes");
  let errors: typeof import("../errors");
  let prisma: typeof import("../prisma").prisma;

  const pending = (id: string, disputeId: string, idempotencyKey: string) =>
    ({ id, disputeId, idempotencyKey, status: "pending" }) as const;

  beforeAll(async () => {
    // prisma.ts reads DATABASE_URL at import time, so set it before importing.
    process.env.DATABASE_URL = TEST_URL;
    repo = await import("./submissions");
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
    await disputes.createDisputeWithEvidence(buildDispute("d2"));
  });

  it("returns one row for the same key created concurrently", async () => {
    const [a, b] = await Promise.all([
      repo.createSubmission(pending("s1", "d1", "key-1")),
      repo.createSubmission(pending("s2", "d1", "key-1")),
    ]);
    expect(a.id).toBe(b.id);
    expect(await prisma.submission.count()).toBe(1);
  });

  it("throws IdempotencyKeyConflictError when the key belongs to another dispute", async () => {
    await repo.createSubmission(pending("s1", "d1", "key-1"));
    await expect(repo.createSubmission(pending("s2", "d2", "key-1"))).rejects.toBeInstanceOf(
      errors.IdempotencyKeyConflictError,
    );
    expect(await prisma.submission.count()).toBe(1);
  });

  it("does not let markFailed overwrite a submitted row", async () => {
    await repo.createSubmission(pending("s1", "d1", "key-1"));
    await repo.markSubmitted("s1", "prov_1");

    await expect(repo.markFailed("s1", "boom")).rejects.toBeInstanceOf(
      errors.SubmissionNotPendingError,
    );

    const row = await prisma.submission.findUniqueOrThrow({ where: { id: "s1" } });
    expect(row.status).toBe("submitted");
    expect(row.providerRef).toBe("prov_1");
    expect(row.errorMessage).toBeNull();
  });

  it("reopens a failed submission to pending, but leaves a submitted one alone", async () => {
    await repo.createSubmission(pending("s1", "d1", "key-1"));
    await repo.markFailed("s1", "boom");
    const reopened = await repo.reopenFailedSubmission("s1");
    expect(reopened).toMatchObject({ id: "s1", status: "pending" });
    expect(reopened?.errorMessage).toBeUndefined();

    await repo.markSubmitted("s1", "prov_1");
    expect((await repo.reopenFailedSubmission("s1"))?.status).toBe("submitted");
    expect(await repo.reopenFailedSubmission("missing")).toBeNull();
  });

  it("finds a submission by key, with its failure message, and null for an unknown key", async () => {
    await repo.createSubmission(pending("s1", "d1", "key-1"));
    await repo.markFailed("s1", "unavailable");
    expect(await repo.getSubmissionByKey("key-1")).toMatchObject({ id: "s1", status: "failed", errorMessage: "unavailable" });
    expect(await repo.getSubmissionByKey("nope")).toBeNull();
  });
});
