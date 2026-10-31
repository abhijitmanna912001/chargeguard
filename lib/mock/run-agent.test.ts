import { describe, expect, it } from "vitest";
import { ActionLogEntrySchema, RecommendationSchema } from "../../contracts";
import { cases } from "../../fixtures/cases";
import { runMockAgent } from "./run-agent";

function deps() {
  let n = 0;
  return { now: () => new Date("2026-11-05T10:00:00.000Z"), createId: () => `id_${++n}` };
}

describe("runMockAgent", () => {
  for (const { dispute, expectedAction } of cases) {
    describe(dispute.id, () => {
      const { recommendation, actionLog } = runMockAgent(dispute, deps());

      it(`recommends ${expectedAction}`, () => {
        expect(recommendation.finalAction).toBe(expectedAction);
        expect(recommendation.modelOutput?.action).toBe(expectedAction);
        expect(recommendation.flags).toEqual(expectedAction === "escalate" ? ["amount_over_limit"] : []);
      });

      it("logs detect, gather, validate, decide in order", () => {
        expect(actionLog.map((e) => e.step)).toEqual(["detect", "gather", "validate", "decide"]);
        expect(actionLog.map((e) => e.actor)).toEqual(["agent", "agent", "rule", "rule"]);
        expect(actionLog.every((e) => e.disputeId === dispute.id)).toBe(true);
      });

      it("is deterministic given the injected clock and ids", () => {
        expect(runMockAgent(dispute, deps())).toEqual({ recommendation, actionLog });
        expect(recommendation.createdAt).toBe("2026-11-05T10:00:00.000Z");
        expect(actionLog.map((e) => e.id)).toEqual(["id_1", "id_2", "id_3", "id_4"]);
        expect(recommendation.id).toBe("id_5");
      });

      it("passes the contract schemas", () => {
        expect(RecommendationSchema.safeParse(recommendation).success).toBe(true);
        for (const e of actionLog) expect(ActionLogEntrySchema.safeParse(e).success).toBe(true);
      });
    });
  }

  it("defends at exactly 1,000,000 paise and escalates above", () => {
    const base = cases[0].dispute;
    expect(runMockAgent({ ...base, amount: 1_000_000 }, deps()).recommendation.finalAction).toBe("defend");
    expect(runMockAgent({ ...base, amount: 1_000_001 }, deps()).recommendation.finalAction).toBe("escalate");
  });

  it("falls back to random ids when createId is omitted", () => {
    const r = runMockAgent(cases[0].dispute, { now: () => new Date("2026-11-05T10:00:00.000Z") });
    expect(new Set(r.actionLog.map((e) => e.id)).size).toBe(4);
  });
});
