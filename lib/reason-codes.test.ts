import { describe, expect, it } from "vitest";
import { reasonLabel } from "./reason-codes";

describe("reasonLabel", () => {
  it("adds the numeric code in brackets", () => {
    expect(reasonLabel("13.1")).toBe("Goods not received (13.1)");
  });
  it("shows enum-style codes as the label alone", () => {
    expect(reasonLabel("GOODS_NOT_RECEIVED")).toBe("Goods not received");
  });
  it("falls back to the code for unknown codes", () => {
    expect(reasonLabel("UNKNOWN_CODE")).toBe("UNKNOWN_CODE");
    expect(reasonLabel("99.9")).toBe("99.9");
  });
  it("does not treat object prototype keys as codes", () => {
    expect(reasonLabel("constructor")).toBe("constructor");
  });
});
