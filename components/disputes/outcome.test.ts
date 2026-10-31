import { describe, expect, it } from "vitest";
import { outcomeLabel, outcomeTone } from "./outcome";

describe("outcome display", () => {
  it("humanizes outcome codes", () => {
    expect(outcomeLabel("evidence_flags_raised")).toBe("Evidence flags raised");
    expect(outcomeLabel("model_failure:timeout")).toBe("Model failure: timeout");
  });
  it("colours only failures", () => {
    expect(outcomeTone("model_failure:timeout")).toBe("danger");
    expect(outcomeTone("internal_error")).toBe("danger");
    expect(outcomeTone("evidence_clear")).toBe("neutral");
  });
});
