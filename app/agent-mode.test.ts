import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cases } from "../fixtures/cases";

// callSarvam is replaced by the mock for the whole file, and fetch is blocked:
// nothing here can reach Sarvam.
const sarvam = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/agent-core/model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/agent-core/model")>();
  const { createMockCallSarvam } = await import("@/agent-core/model/mock");
  const inner = createMockCallSarvam({ action: "defend", confidence: 0.9, reasoning: "Mocked.", evidenceRefs: [] });
  return { ...actual, callSarvam: ((...args: Parameters<typeof inner>) => (sarvam.calls++, inner(...args))) as typeof inner };
});

import { getAgentMode, getAgentRunner, resetAgentModeWarningForTests } from "./agent-mode";

const networkGuard = vi.fn<typeof fetch>(async () => {
  throw new Error("network access is not allowed in this test");
});

beforeEach(() => {
  vi.stubGlobal("fetch", networkGuard);
  vi.stubEnv("SARVAM_API_KEY", "");
  resetAgentModeWarningForTests();
  sarvam.calls = 0;
});
afterEach(() => {
  expect(networkGuard).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getAgentMode", () => {
  it("defaults to mock when unset or empty", () => {
    vi.stubEnv("AGENT_MODE", "");
    expect(getAgentMode()).toBe("mock");
    vi.stubEnv("AGENT_MODE", undefined);
    expect(getAgentMode()).toBe("mock");
  });
  it("accepts mock and live", () => {
    vi.stubEnv("AGENT_MODE", "live");
    expect(getAgentMode()).toBe("live");
    vi.stubEnv("AGENT_MODE", "mock");
    expect(getAgentMode()).toBe("mock");
  });
  it("falls back to mock with a single warning for any other value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("AGENT_MODE", "banana");
    expect(getAgentMode()).toBe("mock");
    expect(getAgentMode()).toBe("mock");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("getAgentRunner", () => {
  it("is undefined in mock mode", () => {
    vi.stubEnv("AGENT_MODE", "mock");
    expect(getAgentRunner()).toBeUndefined();
  });
  it("is undefined for an unknown value", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("AGENT_MODE", "nope");
    expect(getAgentRunner()).toBeUndefined();
  });
  it("runs the real runAgent through the (mocked) callSarvam in live mode", async () => {
    vi.stubEnv("AGENT_MODE", "live");
    const runner = getAgentRunner();
    expect(runner).toBeDefined();
    const { dispute } = cases[0];
    let n = 0;
    const result = await runner!(dispute, { now: () => new Date("2026-11-05T10:00:00.000Z"), createId: () => `x${++n}` });
    expect(sarvam.calls).toBe(1);
    expect(result.recommendation.disputeId).toBe(dispute.id);
    expect(result.actionLog.length).toBeGreaterThan(0);
  });
});
