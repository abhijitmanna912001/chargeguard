import { describe, expect, it } from "vitest";
import { overviewTiles } from "./tiles";

describe("overviewTiles", () => {
  it("returns the four tiles in order, with decided and submitted combined", () => {
    const tiles = overviewTiles([
      { status: "received", count: 2 },
      { status: "awaiting_approval", count: 3 },
      { status: "decided", count: 1 },
      { status: "submitted", count: 4 },
      { status: "escalated", count: 5 },
      { status: "expired", count: 9 },
    ]);
    expect(tiles.map((t) => [t.label, t.count])).toEqual([
      ["Received", 2],
      ["Awaiting approval", 3],
      ["Decided or submitted", 5],
      ["Escalated", 5],
    ]);
  });

  it("shows zeros for missing statuses", () => {
    expect(overviewTiles([]).map((t) => t.count)).toEqual([0, 0, 0, 0]);
  });
});
