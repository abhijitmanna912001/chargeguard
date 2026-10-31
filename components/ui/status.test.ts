import { describe, expect, it } from "vitest";
import { DisputeStatusSchema } from "@/contracts";
import { statusDisplay } from "./status";

describe("statusDisplay", () => {
  it("has a non-empty label and a tone for every dispute status", () => {
    for (const status of DisputeStatusSchema.options) {
      const d = statusDisplay(status);
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.tone).toBeTruthy();
    }
  });

  it("gives every status a distinct label", () => {
    const labels = DisputeStatusSchema.options.map((s) => statusDisplay(s).label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("never presents a submitted response as a win", () => {
    const d = statusDisplay("submitted");
    expect(d.label).toBe("Response submitted");
    expect(d.tone).not.toBe("success");
    expect(d.label.toLowerCase()).not.toMatch(/won|win|success/);
  });

  it("marks the states that need attention with warning, caution and danger tones", () => {
    expect(statusDisplay("awaiting_approval").tone).toBe("warning");
    expect(statusDisplay("escalated").tone).toBe("caution");
    expect(statusDisplay("expired").tone).toBe("danger");
  });
});
