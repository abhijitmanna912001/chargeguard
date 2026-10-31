// Needs a database. Skipped unless TEST_DATABASE_URL is set (see npm run test:db).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDispute, resetDatabase } from "../db/test-helpers";

vi.mock("server-only", () => ({}));

const TEST_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_URL)("runAgentForDispute (database)", () => {
  let run: typeof import("./run-agent-workflow").runAgentForDispute;
  let prisma: typeof import("../db/prisma").prisma;
  const deps = () => {
    let n = 0;
    return { now: () => new Date("2026-11-05T10:00:00.000Z"), createId: () => `id_${++n}` };
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    run = (await import("./run-agent-workflow")).runAgentForDispute;
    prisma = (await import("../db/prisma")).prisma;
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });
  beforeEach(async () => {
    await resetDatabase();
    const disputes = await import("../db/repositories/disputes");
    await disputes.createDisputeWithEvidence(buildDispute("d1"));
  });

  it("runs and saves, leaving a pending approval", async () => {
    const result = await run("d1", deps());
    expect(result.ok).toBe(true);
    expect((await prisma.dispute.findUniqueOrThrow({ where: { id: "d1" } })).status).toBe("awaiting_approval");
    expect(await prisma.approvalRequest.count({ where: { status: "pending" } })).toBe(1);
  });

  it("returns not_ready on a second run instead of throwing", async () => {
    await run("d1", deps());
    expect(await run("d1", deps())).toEqual({ ok: false, reason: "not_ready" });
    expect(await prisma.approvalRequest.count()).toBe(1);
  });

  it("returns not_found for an unknown dispute", async () => {
    expect(await run("nope", deps())).toEqual({ ok: false, reason: "not_found" });
  });
});
