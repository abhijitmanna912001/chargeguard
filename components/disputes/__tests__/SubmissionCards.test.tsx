// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { DefensePackageCard } from "../DefensePackageCard";
import { SubmissionResultCard } from "../SubmissionResultCard";

afterEach(cleanup);

describe("DefensePackageCard", () => {
  it("renders the summary, evidence refs, amount and a simulated notice", () => {
    render(
      <DefensePackageCard
        pkg={{
          disputeId: "d1",
          reasonCode: "13.1",
          amountPaise: 249900,
          summary: "Delivery proof AWB-1 shows delivery on 2026-10-24.",
          evidenceRefs: ["ev_a", "ev_b"],
        }}
      />,
    );
    expect(screen.getByText("Defense package preview")).toBeInTheDocument();
    expect(screen.getByText("Delivery proof AWB-1 shows delivery on 2026-10-24.")).toBeInTheDocument();
    expect(screen.getByText("ev_a")).toBeInTheDocument();
    expect(screen.getByText("ev_b")).toBeInTheDocument();
    expect(screen.getByText("₹2,499.00")).toBeInTheDocument();
    expect(screen.getByText(/simulated payment provider/)).toBeInTheDocument();
  });
});

describe("SubmissionResultCard", () => {
  it("renders the provider reference and the time in IST", () => {
    render(
      <SubmissionResultCard
        submission={{
          id: "s1",
          disputeId: "d1",
          idempotencyKey: "k",
          status: "submitted",
          providerRef: "sim_ref_123",
          submittedAt: "2026-11-02T04:30:00.000Z",
        }}
      />,
    );
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.getByText("sim_ref_123")).toBeInTheDocument();
    expect(screen.getByText(/10:00 am IST/)).toBeInTheDocument();
  });
});
