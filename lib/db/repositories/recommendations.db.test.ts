// Needs a database. Skipped unless TEST_DATABASE_URL is set (see npm run test:db).
// The shared vitest alias for "server-only" is not here yet. Once it lands this
// mock can go away.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDispute, buildRecommendation, resetDatabase } from "../test-helpers";

vi.mock("server-only", () => ({}));

const TEST_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_URL)("recommendations repository (database)", () => {
  let repo: typeof import("./recommendations");
  let disputes: typeof import("./disputes");
  let prisma: typeof import("../prisma").prisma;

  beforeAll(async () => {
    // prisma.ts reads DATABASE_URL at import time, so set it before importing.
    process.env.DATABASE_URL = TEST_URL;
    repo = await import("./recommendations");
    disputes = await import("./disputes");
    prisma = (await import("../prisma")).prisma;
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    await resetDatabase();
    await disputes.createDisputeWithEvidence(buildDispute("d1"));
  });

  it("returns the newest of two recommendations, whatever the insert order", async () => {
    await repo.createRecommendation(buildRecommendation("r_new", "d1", "2026-11-05T00:00:00.000Z"));
    await repo.createRecommendation(buildRecommendation("r_old", "d1", "2026-11-02T00:00:00.000Z"));

    const latest = await repo.getLatestRecommendation("d1");
    expect(latest?.id).toBe("r_new");
  });

  it("returns null when the dispute has none", async () => {
    expect(await repo.getLatestRecommendation("d1")).toBeNull();
  });
});
