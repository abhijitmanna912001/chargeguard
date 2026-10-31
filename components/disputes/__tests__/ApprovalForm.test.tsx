// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionState } from "@/app/disputes/[id]/schemas";
import { ApprovalForm } from "../ApprovalForm";

afterEach(cleanup);

type Fake = (prev: ActionState | null, fd: FormData) => Promise<ActionState>;
const okAction = (): Fake => vi.fn(async () => ({ ok: true }) as const);

function setup(proposedAction: "defend" | "accept" | "escalate", flags: Parameters<typeof ApprovalForm>[0]["flags"], action: Fake) {
  render(<ApprovalForm disputeId="d1" approvalId="a1" proposedAction={proposedAction} flags={flags} action={action} />);
}

const names = () => screen.getAllByRole("button").map((b) => b.textContent);

describe("ApprovalForm buttons", () => {
  it("defend proposal: Approve defend and Reject", () => {
    setup("defend", [], okAction());
    expect(names()).toEqual(["Approve defend", "Reject"]);
  });
  it("accept proposal: Approve accept and Reject", () => {
    setup("accept", [], okAction());
    expect(names()).toEqual(["Approve accept", "Reject"]);
  });
  it("escalate proposal: Defend, Accept and Reject (handle manually)", () => {
    setup("escalate", [], okAction());
    expect(names()).toEqual(["Defend", "Accept", "Reject (handle manually)"]);
  });
  it("limits the note to 500 characters", () => {
    setup("defend", [], okAction());
    expect(screen.getByLabelText(/note/i)).toHaveAttribute("maxlength", "500");
  });
});

describe("ApprovalForm submission", () => {
  it("sends ids, the note and the clicked choice", async () => {
    const action = okAction();
    setup("escalate", [], action);
    await userEvent.type(screen.getByLabelText(/note/i), "checked with ops");
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const fd = (action as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    expect(Object.fromEntries(fd)).toMatchObject({
      disputeId: "d1",
      approvalId: "a1",
      note: "checked with ops",
      choice: "approve:accept",
    });
  });

  it("shows the server error in a polite live region and keeps the note", async () => {
    const action: Fake = vi.fn(async () => ({ ok: false, message: "Someone else has already decided this approval." }));
    setup("defend", [], action);
    await userEvent.type(screen.getByLabelText(/note/i), "keep me");
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    const message = await screen.findByText("Someone else has already decided this approval.");
    expect(message).toHaveAttribute("aria-live", "polite");
    expect(screen.getByLabelText(/note/i)).toHaveValue("keep me");
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("disables every button and shows pending text while the action runs", async () => {
    let finish!: (s: ActionState) => void;
    const action: Fake = () => new Promise<ActionState>((resolve) => (finish = resolve));
    setup("escalate", [], action);
    await userEvent.click(screen.getByRole("button", { name: "Defend" }));
    expect(await screen.findByText("Saving your decision…")).toBeVisible();
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
    finish({ ok: true });
    await waitFor(() => expect(screen.queryByText("Saving your decision…")).not.toBeInTheDocument());
    for (const b of screen.getAllByRole("button")) expect(b).toBeEnabled();
  });
});

describe("blocking flag override warning", () => {
  it("is shown near Defend, naming the flags, when a blocking flag is present", () => {
    setup("escalate", ["missing_evidence", "deadline_at_risk"], okAction());
    const warning = screen.getByText(/defending overrides/i);
    expect(warning).toHaveTextContent("Warning:");
    expect(warning).toHaveTextContent("Missing evidence");
    expect(warning).not.toHaveTextContent("Deadline at risk"); // not a blocking flag
    expect(screen.getByRole("button", { name: "Defend" })).toHaveAccessibleDescription(/defending overrides/i);
    expect(screen.getByRole("button", { name: "Defend" })).toBeEnabled(); // warns, does not block
  });
  it("is absent without blocking flags", () => {
    setup("escalate", ["deadline_at_risk"], okAction());
    expect(screen.queryByText(/defending overrides/i)).not.toBeInTheDocument();
  });
  it("is absent for an accept proposal even with blocking flags", () => {
    setup("accept", ["missing_evidence"], okAction());
    expect(screen.queryByText(/defending overrides/i)).not.toBeInTheDocument();
  });
});
