// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import type { ActionLogEntry, Dispute } from "@/contracts";
import { NeedsDecisionList } from "../NeedsDecisionList";
import { RecentActivity } from "../RecentActivity";
import { StatusTiles } from "../StatusTiles";

afterEach(cleanup);

const now = new Date("2026-11-01T00:00:00.000Z");
const dispute = (id: string, deadline: string): Dispute => ({
  id,
  transactionId: `txn_${id}`,
  amount: 249900,
  reasonCode: "13.1",
  deadline,
  createdAt: "2026-10-25T00:00:00.000Z",
  status: "awaiting_approval",
  evidence: [],
});

describe("NeedsDecisionList", () => {
  it("shows the empty state when nothing is waiting", () => {
    render(<NeedsDecisionList disputes={[]} now={now} />);
    expect(screen.getByText("Nothing waiting for you")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links each dispute to its detail page with amount, reason and deadline", () => {
    render(<NeedsDecisionList disputes={[dispute("dsp_1", "2026-11-02T00:00:00.000Z"), dispute("dsp_2", "2026-11-20T00:00:00.000Z")]} now={now} />);
    const first = screen.getByRole("link", { name: /dsp_1/ });
    expect(first).toHaveAttribute("href", "/disputes/dsp_1");
    expect(within(first).getByText("₹2,499.00")).toBeInTheDocument();
    expect(within(first).getByText("Reason code 13.1")).toBeInTheDocument();
    expect(within(first).getByText("1 day left")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dsp_2/ })).toHaveAttribute("href", "/disputes/dsp_2");
  });
});

describe("StatusTiles", () => {
  it("renders the four labelled counts", () => {
    render(<StatusTiles counts={[{ status: "awaiting_approval", count: 3 }, { status: "escalated", count: 1 }]} />);
    const awaiting = screen.getByText("Awaiting approval").closest("li")!;
    expect(within(awaiting).getByText("3")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });
});

describe("RecentActivity", () => {
  const entry: ActionLogEntry = {
    id: "l1",
    disputeId: "dsp_1",
    timestamp: "2026-11-02T04:30:00.000Z",
    step: "decide",
    actor: "agent",
    summary: "Recommended defend",
    evidenceRefs: [],
    outcome: "ok",
  };

  it("shows the empty state", () => {
    render(<RecentActivity entries={[]} />);
    expect(screen.getByText("No agent activity yet")).toBeInTheDocument();
  });

  it("names the actor in text and links to the dispute", () => {
    render(<RecentActivity entries={[entry]} />);
    expect(screen.getByText("Recommended defend")).toBeInTheDocument();
    expect(screen.getByText(/Agent/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "dsp_1" })).toHaveAttribute("href", "/disputes/dsp_1");
    expect(screen.getByText("2 Nov 2026, 10:00 am IST")).toBeInTheDocument();
  });
});
