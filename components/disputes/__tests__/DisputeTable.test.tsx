// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import type { Recommendation } from "@/contracts";
import { cases } from "@/fixtures/cases";
import { DisputeTable } from "../DisputeTable";

afterEach(cleanup);

const [first, second] = cases.map((c) => c.dispute);
const now = new Date("2026-11-05T10:00:00.000Z");
const stored: Recommendation = {
  id: "r1",
  disputeId: first.id,
  createdAt: "2026-11-02T00:00:00.000Z",
  modelOutput: null,
  finalAction: "escalate",
  flags: ["model_failure"],
};

function rowOf(id: string) {
  return screen.getByRole("link", { name: id }).closest("tr")!;
}

describe("DisputeTable recommendations", () => {
  it("shows the stored action, and Not run yet when there is none", () => {
    render(<DisputeTable disputes={[first, second]} now={now} recommendations={new Map([[first.id, stored]])} isMockAgent={false} />);
    expect(within(rowOf(first.id)).getByText("Escalate")).toBeInTheDocument();
    expect(within(rowOf(second.id)).getByText("Not run yet")).toBeInTheDocument();
  });

  it("shows the Mock tag only in mock mode, and never on Not run yet", () => {
    const recs = new Map([[first.id, stored]]);
    const { rerender } = render(<DisputeTable disputes={[first, second]} now={now} recommendations={recs} isMockAgent />);
    expect(within(rowOf(first.id)).getByText("Mock")).toBeInTheDocument();
    expect(within(rowOf(second.id)).queryByText("Mock")).not.toBeInTheDocument();
    rerender(<DisputeTable disputes={[first, second]} now={now} recommendations={recs} isMockAgent={false} />);
    expect(screen.queryByText("Mock")).not.toBeInTheDocument();
  });
});
