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
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
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

describe("blocking flag override: confirm before defending", () => {
  it("shows nothing until Defend is selected, then warns naming the blocking flags only", async () => {
    setup("escalate", ["missing_evidence", "deadline_at_risk"], okAction());
    expect(screen.queryByText(/defending overrides/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Defend" }));
    const warning = screen.getByText(/defending overrides/i);
    expect(warning).toHaveTextContent("Warning:");
    expect(warning).toHaveTextContent("Missing evidence");
    expect(warning).not.toHaveTextContent("Deadline at risk"); // not a blocking flag
    expect(screen.getByRole("button", { name: "Defend" })).toHaveAttribute("aria-expanded", "true");
  });

  it("does not submit on Defend; the confirm button stays disabled until the checkbox is ticked", async () => {
    const action = okAction();
    setup("escalate", ["missing_evidence"], action);
    await userEvent.click(screen.getByRole("button", { name: "Defend" }));
    expect(action).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", { name: "Confirm and defend" });
    expect(confirm).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: /I understand the rules advise against defending this dispute/ }));
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const fd = (action as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    expect(Object.fromEntries(fd)).toMatchObject({ choice: "approve:defend" });
    expect(fd.has("understood")).toBe(false); // the checkbox is UX only, never sent
  });

  it("Cancel hides the warning and clears the checkbox", async () => {
    setup("escalate", ["missing_evidence"], okAction());
    await userEvent.click(screen.getByRole("button", { name: "Defend" }));
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/defending overrides/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Defend" }));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("Accept does not show the blocking-flag warning, only its own confirmation", async () => {
    setup("escalate", ["missing_evidence"], okAction());
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(screen.queryByText(/defending overrides/i)).not.toBeInTheDocument();
    expect(screen.getByText(/accepts the dispute without a defense/i)).toBeInTheDocument();
  });

  it("Defend submits straight away when there is no blocking flag", async () => {
    const action = okAction();
    setup("escalate", ["deadline_at_risk"], action);
    await userEvent.click(screen.getByRole("button", { name: "Defend" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/defending overrides/i)).not.toBeInTheDocument();
  });

  it("never shows the warning for an accept proposal, even with blocking flags", () => {
    setup("accept", ["missing_evidence"], okAction());
    expect(screen.queryByText(/defending overrides/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Defend" })).not.toBeInTheDocument();
  });

  it("titles the panel and says the human decides", () => {
    setup("escalate", [], okAction());
    expect(screen.getByRole("heading", { name: "Your decision" })).toBeInTheDocument();
    expect(screen.getByText(/agent only recommends/i)).toBeInTheDocument();
  });
});

const REJECT_TEXT = "This hands the dispute to a person. The agent will not send a response. This cannot be undone.";

describe("confirming Reject and Accept", () => {
  it("Reject does not submit; it shows the consequence with Confirm and Cancel", async () => {
    const action = okAction();
    setup("escalate", [], action);
    await userEvent.click(screen.getByRole("button", { name: "Reject (handle manually)" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText(REJECT_TEXT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject (handle manually)" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("Confirm sends the reject choice with the note", async () => {
    const action = okAction();
    setup("escalate", [], action);
    await userEvent.type(screen.getByLabelText(/note/i), "handling by phone");
    await userEvent.click(screen.getByRole("button", { name: "Reject (handle manually)" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const fd = (action as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    expect(Object.fromEntries(fd)).toMatchObject({ disputeId: "d1", approvalId: "a1", note: "handling by phone", choice: "reject" });
  });

  it("Cancel closes the panel, sends nothing, and keeps the note", async () => {
    const action = okAction();
    setup("escalate", [], action);
    await userEvent.type(screen.getByLabelText(/note/i), "keep");
    await userEvent.click(screen.getByRole("button", { name: "Reject (handle manually)" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(REJECT_TEXT)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/note/i)).toHaveValue("keep");
    expect(action).not.toHaveBeenCalled();
  });

  it("Accept (escalated case) confirms with approve:accept", async () => {
    const action = okAction();
    setup("escalate", [], action);
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(action).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const fd = (action as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    expect(fd.get("choice")).toBe("approve:accept");
  });

  it("Approve accept and Reject on an accept proposal are both confirmed", async () => {
    const action = okAction();
    setup("accept", [], action);
    await userEvent.click(screen.getByRole("button", { name: "Approve accept" }));
    expect(action).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect((action as ReturnType<typeof vi.fn>).mock.calls[0][1].get("choice")).toBe("approve");
  });

  it("only one confirmation panel is open at a time", async () => {
    setup("escalate", ["missing_evidence"], okAction());
    await userEvent.click(screen.getByRole("button", { name: "Defend" }));
    await userEvent.click(screen.getByRole("button", { name: "Reject (handle manually)" }));
    expect(screen.queryByText(/defending overrides/i)).not.toBeInTheDocument();
    expect(screen.getByText(REJECT_TEXT)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Confirm" })).toHaveLength(1);
  });

  it("disables Confirm and Cancel while the action runs", async () => {
    let finish!: (s: ActionState) => void;
    const action: Fake = () => new Promise<ActionState>((resolve) => (finish = resolve));
    setup("escalate", [], action);
    await userEvent.click(screen.getByRole("button", { name: "Reject (handle manually)" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Saving your decision…")).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    finish({ ok: true });
  });
});
