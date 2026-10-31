// Needs a database. Skipped unless TEST_DATABASE_URL is set (see npm run test:db).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDispute, resetDatabase } from "../test-helpers";

vi.mock("server-only", () => ({}));

const TEST_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_URL)("disputes repository: listDisputesByStatus (database)", () => {
  let repo: typeof import("./disputes");
  let prisma: typeof import("../prisma").prisma;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    repo = await import("./disputes");
    prisma = (await import("../prisma")).prisma;
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    await resetDatabase();
  });

  it("returns only disputes in that status, soonest deadline first", async () => {
    const make = (id: string, status: "awaiting_approval" | "received", deadline: string) =>
      repo.createDisputeWithEvidence({ ...buildDispute(id), status, deadline });
    await make("late", "awaiting_approval", "2026-12-10T00:00:00.000Z");
    await make("soon", "awaiting_approval", "2026-12-02T00:00:00.000Z");
    await make("other", "received", "2026-12-01T00:00:00.000Z");

    const rows = await repo.listDisputesByStatus("awaiting_approval");
    expect(rows.map((d) => d.id)).toEqual(["soon", "late"]);
    expect(await repo.listDisputesByStatus("expired")).toEqual([]);
  });
});
