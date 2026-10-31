// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import type { Recommendation } from "@/contracts";
import { RecommendationCard } from "../RecommendationCard";

afterEach(cleanup);

const base: Recommendation = {
  id: "r1",
  disputeId: "d1",
  createdAt: "2026-11-01T00:00:00.000Z",
  modelOutput: { action: "escalate", confidence: 0.87, reasoning: "Delivery proof is incomplete.", evidenceRefs: ["ev_1", "ev_2"] },
  finalAction: "escalate",
  flags: ["missing_evidence", "deadline_at_risk"],
};

describe("RecommendationCard", () => {
  it("shows action, confidence, reasoning and evidence references", () => {
    render(<RecommendationCard recommendation={base} isMock={false} />);
    expect(screen.getByText("Escalate")).toBeInTheDocument();
    expect(screen.getByText("Confidence 87%")).toBeInTheDocument();
    expect(screen.getByText("Delivery proof is incomplete.")).toBeInTheDocument();
    expect(screen.getByText("ev_1")).toBeInTheDocument();
    expect(screen.getByText("ev_2")).toBeInTheDocument();
    expect(screen.queryByText("Mock")).not.toBeInTheDocument();
  });

  it("labels flags and marks blocking ones with text", () => {
    render(<RecommendationCard recommendation={base} isMock />);
    const items = within(screen.getByRole("list", { name: "Flags" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Missing evidence");
    expect(items[0]).toHaveTextContent("Blocking");
    expect(items[1]).toHaveTextContent("Deadline at risk");
    expect(items[1]).not.toHaveTextContent("Blocking");
    expect(screen.getByText("Mock")).toBeInTheDocument();
  });

  it("shows the failure message instead of reasoning when modelOutput is null", () => {
    const failed: Recommendation = { ...base, modelOutput: null, flags: ["model_failure"], finalAction: "escalate" };
    render(<RecommendationCard recommendation={failed} isMock={false} />);
    expect(screen.getByText(/could not produce a recommendation/i)).toBeInTheDocument();
    expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("Model failure");
    expect(screen.getByRole("listitem")).toHaveTextContent("Blocking");
  });

  it("shows the failure message when the model_failure flag is set even with output present", () => {
    render(<RecommendationCard recommendation={{ ...base, flags: ["model_failure"] }} isMock={false} />);
    expect(screen.getByText(/could not produce a recommendation/i)).toBeInTheDocument();
    expect(screen.queryByText("Delivery proof is incomplete.")).not.toBeInTheDocument();
  });

  it("explains a rule override of the model's action", () => {
    const rec: Recommendation = { ...base, modelOutput: { ...base.modelOutput!, action: "defend" }, overrideReason: "amount over limit" };
    render(<RecommendationCard recommendation={rec} isMock={false} />);
    expect(screen.getByText(/model suggested defend, but the rules changed it to escalate: amount over limit/i)).toBeInTheDocument();
  });
});
