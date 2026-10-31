// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

afterEach(cleanup);

describe("Button", () => {
  it("is a type=button by default and fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Approve</Button>);
    const b = screen.getByRole("button", { name: "Approve" });
    expect(b).toHaveAttribute("type", "button");
    await userEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("when loading it is disabled, busy and does not fire onClick", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Saving</Button>);
    const b = screen.getByRole("button", { name: "Saving" });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("aria-busy", "true");
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is not busy when idle", () => {
    render(<Button variant="danger">Reject</Button>);
    expect(screen.getByRole("button", { name: "Reject" })).not.toHaveAttribute("aria-busy");
  });
});
