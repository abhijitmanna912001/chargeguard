import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEvalResults } from "./load-results";

const valid = {
  generatedAt: "2026-11-02T04:30:00.000Z",
  model: "sarvam-m",
  agentMode: "live",
  cases: [
    {
      disputeId: "dsp_1",
      expectedAction: "defend",
      finalAction: "defend",
      modelAction: "defend",
      correct: true,
      confidence: 0.9,
      flags: [],
      evidenceRequirementsMet: 3,
      evidenceRequirementsTotal: 3,
      latencyMs: 1200,
      attemptCount: 1,
      totalTokens: 800,
      modelFailure: false,
    },
  ],
  summary: { total: 1, correct: 1, accuracy: 1, modelFailures: 0, medianLatencyMs: 1200, maxLatencyMs: 1200 },
};

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "eval-results-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(name: string, content: string): Promise<string> {
  const p = path.join(dir, name);
  await writeFile(p, content);
  return p;
}

describe("loadEvalResults", () => {
  it("returns ok with parsed results for a valid file", async () => {
    const r = await loadEvalResults(await write("ok.json", JSON.stringify(valid)));
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.results.cases[0].disputeId).toBe("dsp_1");
  });

  it("returns missing when the file does not exist", async () => {
    expect(await loadEvalResults(path.join(dir, "nope.json"))).toEqual({ status: "missing" });
  });

  it("returns invalid for broken JSON without leaking the path or content", async () => {
    const p = await write("broken.json", "{ not json SECRET");
    const r = await loadEvalResults(p);
    expect(r.status).toBe("invalid");
    if (r.status === "invalid") {
      expect(r.message).not.toContain("SECRET");
      expect(r.message).not.toContain(dir);
    }
  });

  it("returns invalid for data that fails the schema", async () => {
    const r = await loadEvalResults(await write("bad.json", JSON.stringify({ ...valid, agentMode: "mock" })));
    expect(r.status).toBe("invalid");
    if (r.status === "invalid") expect(r.message).toContain("agentMode");
  });

  it("returns invalid for inconsistent summary data", async () => {
    const bad = { ...valid, summary: { ...valid.summary, correct: 0 } };
    expect((await loadEvalResults(await write("inconsistent.json", JSON.stringify(bad)))).status).toBe("invalid");
  });

  it("does not throw when the path is a directory", async () => {
    const r = await loadEvalResults(dir);
    expect(r.status).toBe("invalid");
  });
});
