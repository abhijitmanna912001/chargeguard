import { describe, expect, it } from "vitest";
import type { ActionLogEntry } from "../../contracts";
import { capPerDispute } from "./cap-per-dispute";

const e = (id: string, disputeId: string): ActionLogEntry => ({
  id, disputeId, timestamp: "2026-11-05T10:00:00.000Z", step: "decide", actor: "rule", summary: id, evidenceRefs: [], outcome: "ok",
});
const list = [e("a1", "A"), e("a2", "A"), e("a3", "A"), e("b1", "B"), e("a4", "A"), e("c1", "C")];

describe("capPerDispute", () => {
  it("keeps the first N per dispute and preserves order", () => {
    expect(capPerDispute(list, 2, 10).map((x) => x.id)).toEqual(["a1", "a2", "b1", "c1"]);
  });
  it("stops at the total limit", () => {
    expect(capPerDispute(list, 2, 3).map((x) => x.id)).toEqual(["a1", "a2", "b1"]);
  });
  it("returns nothing for an empty list", () => {
    expect(capPerDispute([], 2, 5)).toEqual([]);
  });
});
