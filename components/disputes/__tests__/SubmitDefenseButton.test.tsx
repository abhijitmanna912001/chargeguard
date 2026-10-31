// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionState } from "@/app/disputes/[id]/schemas";
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
});
