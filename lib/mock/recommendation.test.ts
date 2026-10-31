import { describe, expect, it } from "vitest";
import { cases } from "../../fixtures/cases";
import { getMockRecommendation } from "./recommendation";

describe("getMockRecommendation", () => {
  const base = cases[0].dispute;

  it("defends at or below 1,000,000 paise", () => {
    expect(getMockRecommendation({ ...base, amount: 1_000_000 }).action).toBe("defend");
    expect(getMockRecommendation({ ...base, amount: 0 }).action).toBe("defend");
  });
  it("escalates above 1,000,000 paise", () => {
    expect(getMockRecommendation({ ...base, amount: 1_000_001 }).action).toBe("escalate");
  });
  it("is always labelled Mock", () => {
    expect(getMockRecommendation(base).label).toBe("Mock");
  });
  it("agrees with the seeded fixtures", () => {
    for (const { dispute, expectedAction } of cases) {
      expect(getMockRecommendation(dispute).action).toBe(expectedAction);
    }
  });
});
