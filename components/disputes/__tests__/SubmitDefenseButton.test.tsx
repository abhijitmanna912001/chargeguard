// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROVIDER_REJECTED_MESSAGE, type ActionState } from "@/app/disputes/[id]/schemas";
import { SubmitDefenseButton } from "../SubmitDefenseButton";

afterEach(cleanup);

describe("SubmitDefenseButton", () => {
  it("labels the button Submit by default and Retry after a failure", () => {
    const { rerender } = render(<SubmitDefenseButton action={async () => ({ ok: true })} />);
    expect(screen.getByRole("button", { name: "Submit defense (simulated)" })).toBeEnabled();
    rerender(<SubmitDefenseButton action={async () => ({ ok: true })} isRetry />);
    expect(screen.getByRole("button", { name: "Retry submission" })).toBeEnabled();
  });

  it("calls the action once, disabled with pending text meanwhile", async () => {
    let finish!: (s: ActionState) => void;
    const action = vi.fn(() => new Promise<ActionState>((r) => (finish = r)));
    render(<SubmitDefenseButton action={action} />);
    await userEvent.click(screen.getByRole("button", { name: "Submit defense (simulated)" }));
    expect(await screen.findByRole("button", { name: "Submitting (simulated)…" })).toBeDisabled();
    expect(action).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit defense (simulated)" })).toBeEnabled());
  });

  it("shows the server error politely", async () => {
    const message = "The payment provider did not accept the response. You can try again.";
    render(<SubmitDefenseButton action={async () => ({ ok: false, message })} />);
    await userEvent.click(screen.getByRole("button", { name: "Submit defense (simulated)" }));
    expect(await screen.findByText(message)).toHaveAttribute("aria-live", "polite");
  });

  it("shows the recorded failure reason beside Retry as the only message", () => {
    render(<SubmitDefenseButton action={async () => ({ ok: true })} isRetry lastFailure="Provider unavailable (HTTP 503)" />);
    expect(screen.getByText("The last simulated submission failed: Provider unavailable (HTTP 503)")).toHaveAttribute("aria-live", "polite");
    expect(screen.queryByText(/did not accept/)).not.toBeInTheDocument();
  });

  it("after a failed retry shows the specific reason once, not the generic provider message too", async () => {
    const action = async (): Promise<ActionState> => ({ ok: false, message: PROVIDER_REJECTED_MESSAGE });
    render(<SubmitDefenseButton action={action} isRetry lastFailure="Provider unavailable (HTTP 503)" />);
    await userEvent.click(screen.getByRole("button", { name: "Retry submission" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry submission" })).toBeEnabled());
    expect(screen.getByText(/Provider unavailable \(HTTP 503\)/)).toBeInTheDocument();
    expect(screen.queryByText(PROVIDER_REJECTED_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getAllByText(/failed|did not accept/)).toHaveLength(1);
  });

  it("still shows other action errors even when a failure is recorded", async () => {
    const action = async (): Promise<ActionState> => ({ ok: false, message: "This dispute is not ready for that step." });
    render(<SubmitDefenseButton action={action} isRetry lastFailure="Provider unavailable (HTTP 503)" />);
    await userEvent.click(screen.getByRole("button", { name: "Retry submission" }));
    expect(await screen.findByText("This dispute is not ready for that step.")).toBeInTheDocument();
    expect(screen.queryByText(/last simulated submission failed/)).not.toBeInTheDocument();
  });
});
