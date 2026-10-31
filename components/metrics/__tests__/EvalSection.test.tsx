// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import type { EvalResults } from "@/contracts";
import { EvalResultsSchema } from "@/contracts";
import { EvalSection } from "../EvalSection";

afterEach(cleanup);

// Built here for the test only. No eval/results.json is committed.
const sample: EvalResults = {
  generatedAt: "2026-11-02T04:30:00.000Z",
  model: "sarvam-test-model",
  agentMode: "live",
  cases: [
    {
      disputeId: "dsp_ok",
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
    {
      disputeId: "dsp_bad",
      expectedAction: "accept",
      finalAction: "escalate",
      modelAction: null,
      correct: false,
      confidence: null,
      flags: ["model_failure", "missing_evidence"],
      evidenceRequirementsMet: 1,
      evidenceRequirementsTotal: 3,
      latencyMs: 3000,
      attemptCount: 2,
      totalTokens: null,
      modelFailure: true,
    },
  ],
  summary: { total: 2, correct: 1, accuracy: 0.5, modelFailures: 1, medianLatencyMs: 2100, maxLatencyMs: 3000 },
};

describe("EvalSection", () => {
  it("the sample itself satisfies the contract", () => {
    expect(EvalResultsSchema.safeParse(sample).success).toBe(true);
  });

  it("shows the summary, the model name and the generated time in IST", () => {
    render(<EvalSection result={{ status: "ok", results: sample }} />);
    expect(screen.getByText("sarvam-test-model")).toBeInTheDocument();
    expect(screen.getByText(/2 Nov 2026, 10:00 am IST/i)).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByText("2,100 ms")).toBeInTheDocument();
  });

  it("labels a correct case in text", () => {
    render(<EvalSection result={{ status: "ok", results: sample }} />);
    const row = within(screen.getByRole("row", { name: /dsp_ok/ }));
    expect(row.getByText(/Correct/)).toBeInTheDocument();
    expect(row.queryByText(/Incorrect/)).not.toBeInTheDocument();
    expect(row.getByText("90%")).toBeInTheDocument();
    expect(row.getByText("3 of 3")).toBeInTheDocument();
    expect(row.getByText("1,200 ms")).toBeInTheDocument();
    expect(row.getByText("800")).toBeInTheDocument();
  });

  it("labels an incorrect case, a failed model, flags and missing tokens in text", () => {
    render(<EvalSection result={{ status: "ok", results: sample }} />);
    const row = within(screen.getByRole("row", { name: /dsp_bad/ }));
    expect(row.getByText(/Incorrect/)).toBeInTheDocument();
    expect(row.getByText("No answer (model failed)")).toBeInTheDocument();
    expect(row.getByText("Model failure")).toBeInTheDocument();
    expect(row.getByText("Missing evidence")).toBeInTheDocument();
    expect(row.getByText("1 of 3")).toBeInTheDocument();
    expect(row.getByText("Not reported")).toBeInTheDocument();
    expect(row.getByText("Escalate")).toBeInTheDocument();
    expect(row.getByText("Accept")).toBeInTheDocument();
  });

  it("has a captioned table", () => {
    render(<EvalSection result={{ status: "ok", results: sample }} />);
    expect(screen.getByRole("table", { name: /one row per demo fixture/i })).toBeInTheDocument();
  });

  it("shows the missing-file message", () => {
    render(<EvalSection result={{ status: "missing" }} />);
    expect(screen.getByText("No evaluation results yet.")).toBeInTheDocument();
    expect(screen.getByText("Run npm run eval.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows only the safe message when the file is invalid", () => {
    render(<EvalSection result={{ status: "invalid", message: "The evaluation results file is not valid JSON." }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("could not be shown");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
