// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionState } from "@/app/disputes/[id]/schemas";
import { RunAgentButton } from "../RunAgentButton";

afterEach(cleanup);

describe("RunAgentButton", () => {
  it("calls the action once, disabled with pending text meanwhile", async () => {
    let finish!: (s: ActionState) => void;
    const action = vi.fn(() => new Promise<ActionState>((r) => (finish = r)));
    render(<RunAgentButton action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Run agent" }));
    const pending = await screen.findByRole("button", { name: "Running agent…" });
    expect(pending).toBeDisabled();
    expect(action).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    await waitFor(() => expect(screen.getByRole("button", { name: "Run agent" })).toBeEnabled());
  });

  it("shows the server error politely", async () => {
    render(<RunAgentButton action={async () => ({ ok: false, message: "This dispute is not ready for that step." })} />);
    await userEvent.click(screen.getByRole("button", { name: "Run agent" }));
    expect(await screen.findByText("This dispute is not ready for that step.")).toHaveAttribute("aria-live", "polite");
  });

  it("in live mode shows the wait note, politely announced, only while pending", async () => {
    let finish!: (s: ActionState) => void;
    const action = vi.fn(() => new Promise<ActionState>((r) => (finish = r)));
    render(<RunAgentButton action={action} isMockAgent={false} />);
    const note = "Analysing the evidence. This can take up to 30 seconds.";
    expect(screen.queryByText(note)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Run agent" }));
    expect(await screen.findByText(note)).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: "Running agent…" })).toBeDisabled();
    finish({ ok: true });
    await waitFor(() => expect(screen.queryByText(note)).not.toBeInTheDocument());
  });

  it("in mock mode does not show the wait note while pending", async () => {
    let finish!: (s: ActionState) => void;
    render(<RunAgentButton action={() => new Promise<ActionState>((r) => (finish = r))} isMockAgent />);
    await userEvent.click(screen.getByRole("button", { name: "Run agent" }));
    await screen.findByRole("button", { name: "Running agent…" });
    expect(screen.queryByText(/Analysing the evidence/)).not.toBeInTheDocument();
    finish({ ok: true });
  });
});
