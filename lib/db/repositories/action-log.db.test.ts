// Needs a database. Skipped unless TEST_DATABASE_URL is set (see npm run test:db).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionLogEntry } from "../../../contracts";
import { buildDispute, resetDatabase } from "../test-helpers";

vi.mock("server-only", () => ({}));

const TEST_URL = process.env.TEST_DATABASE_URL;

const entry = (id: string, disputeId: string, timestamp: string): ActionLogEntry => ({
  id,
  disputeId,
  timestamp,
  step: "gather",
  actor: "agent",
  summary: `entry ${id}`,
  evidenceRefs: [],
  outcome: "ok",
});

describe.skipIf(!TEST_URL)("action log repository (database)", () => {
  let repo: typeof import("./action-log");
  let disputes: typeof import("./disputes");
  let prisma: typeof import("../prisma").prisma;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    repo = await import("./action-log");
    disputes = await import("./disputes");
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

  it("returns entries with identical timestamps in insertion order, not id order", async () => {
    const ts = "2026-11-05T10:00:00.000Z";
    // Random, deliberately non-sorted ids: neither ascending nor descending.
    const ids = ["k3f9", "a81c", "z07e", "m5d2"];
    for (const id of ids) await repo.appendActionLog(entry(id, "d1", ts));

    expect((await repo.listActionLog("d1")).map((e) => e.id)).toEqual(ids);
  });

  it("still sorts by timestamp first, then insertion order", async () => {
    await repo.appendActionLog(entry("late", "d1", "2026-11-05T10:00:02.000Z"));
    await repo.appendActionLog(entry("early_b", "d1", "2026-11-05T10:00:01.000Z"));
    await repo.appendActionLog(entry("early_a", "d1", "2026-11-05T10:00:01.000Z"));
    expect((await repo.listActionLog("d1")).map((e) => e.id)).toEqual(["early_b", "early_a", "late"]);
  });

  it("only lists the requested dispute and does not expose seq", async () => {
    await repo.appendActionLog(entry("x1", "d1", "2026-11-05T10:00:00.000Z"));
    await repo.appendActionLog(entry("y1", "d2", "2026-11-05T10:00:00.000Z"));
    const list = await repo.listActionLog("d1");
    expect(list.map((e) => e.id)).toEqual(["x1"]);
    expect(list[0]).not.toHaveProperty("seq");
  });

  it("lists the newest entries across disputes, newest first, capped by limit", async () => {
    await repo.appendActionLog(entry("old", "d1", "2026-11-05T10:00:00.000Z"));
    await repo.appendActionLog(entry("mid_b", "d2", "2026-11-05T10:00:05.000Z"));
    await repo.appendActionLog(entry("mid_a", "d1", "2026-11-05T10:00:05.000Z"));
    await repo.appendActionLog(entry("new", "d2", "2026-11-05T10:00:09.000Z"));

    expect((await repo.listRecentActionLog(10)).map((e) => e.id)).toEqual(["new", "mid_a", "mid_b", "old"]);
    expect((await repo.listRecentActionLog(2)).map((e) => e.id)).toEqual(["new", "mid_a"]);
  });

  it("rejects a limit that is not an integer from 1 to 100", async () => {
    for (const bad of [0, -1, 1.5, 101, Number.NaN]) {
      await expect(repo.listRecentActionLog(bad)).rejects.toThrow(RangeError);
    }
  });

  it("lists recent entries with at most N per dispute", async () => {
    await repo.appendActionLog(entry("a1", "d1", "2026-11-05T10:00:01.000Z"));
    await repo.appendActionLog(entry("a2", "d1", "2026-11-05T10:00:02.000Z"));
    await repo.appendActionLog(entry("a3", "d1", "2026-11-05T10:00:03.000Z"));
    await repo.appendActionLog(entry("b1", "d2", "2026-11-05T10:00:00.000Z"));
    expect((await repo.listRecentActionLogPerDispute(2, 10)).map((e) => e.id)).toEqual(["a3", "a2", "b1"]);
    expect((await repo.listRecentActionLogPerDispute(2, 2)).map((e) => e.id)).toEqual(["a3", "a2"]);
    await expect(repo.listRecentActionLogPerDispute(0, 5)).rejects.toThrow(RangeError);
  });
});
