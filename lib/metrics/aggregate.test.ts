import { describe, expect, it } from "vitest";
import { fillStatusCounts, formatSeconds, summarizeApprovalOutcomes, summarizeDurations } from "./aggregate";

describe("fillStatusCounts", () => {
  it("lists every status in contract order with zeros for missing ones", () => {
    const out = fillStatusCounts([
      { status: "submitted", count: 2 },
      { status: "received", count: 1 },
    ]);
    expect(out.map((r) => r.status)).toEqual([
      "received", "gathering", "decided", "awaiting_approval", "submitted", "accepted", "escalated", "expired",
    ]);
    expect(out.find((r) => r.status === "received")?.count).toBe(1);
    expect(out.find((r) => r.status === "submitted")?.count).toBe(2);
    expect(out.find((r) => r.status === "expired")?.count).toBe(0);
  });
});

describe("summarizeApprovalOutcomes", () => {
  it("splits approved by the human's chosen action and keeps zeros", () => {
    const out = summarizeApprovalOutcomes([
      { status: "approved", resolvedAction: "defend", count: 3 },
      { status: "approved", resolvedAction: "accept", count: 1 },
      { status: "rejected", resolvedAction: null, count: 2 },
    ]);
    expect(out).toEqual([
      { outcome: "pending", count: 0 },
      { outcome: "approved_defend", count: 3 },
      { outcome: "approved_accept", count: 1 },
      { outcome: "rejected", count: 2 },
    ]);
  });

  it("adds up several groups of the same outcome", () => {
    const out = summarizeApprovalOutcomes([
      { status: "pending", resolvedAction: null, count: 1 },
      { status: "pending", resolvedAction: null, count: 2 },
    ]);
    expect(out[0]).toEqual({ outcome: "pending", count: 3 });
  });
});

describe("summarizeDurations", () => {
  it("returns nulls when nothing was decided", () => {
    expect(summarizeDurations([])).toEqual({ count: 0, medianSeconds: null, maxSeconds: null });
  });
  it("takes the middle value for an odd count", () => {
    expect(summarizeDurations([30, 10, 20])).toEqual({ count: 3, medianSeconds: 20, maxSeconds: 30 });
  });
  it("averages the two middle values for an even count", () => {
    expect(summarizeDurations([10, 20, 30, 40])).toEqual({ count: 4, medianSeconds: 25, maxSeconds: 40 });
  });
  it("drops negative and non-finite values", () => {
    expect(summarizeDurations([-5, Number.NaN, 8])).toEqual({ count: 1, medianSeconds: 8, maxSeconds: 8 });
  });
});

describe("formatSeconds", () => {
  it("formats seconds, minutes and hours", () => {
    expect(formatSeconds(0)).toBe("0 s");
    expect(formatSeconds(45)).toBe("45 s");
    expect(formatSeconds(60)).toBe("1 min");
    expect(formatSeconds(150)).toBe("2 min 30 s");
    expect(formatSeconds(7260)).toBe("2 h 1 min");
    expect(formatSeconds(7200)).toBe("2 h");
  });
});
