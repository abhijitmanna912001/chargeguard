// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/disputes" }));
// jsdom cannot navigate; keep the click handler but drop the default action.
vi.mock("next/link", () => ({
  default: ({ href, onClick, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} onClick={(e) => { e.preventDefault(); onClick?.(e); }} {...rest}>{children}</a>
  ),
}));

import { MobileNav } from "./MobileNav";

afterEach(cleanup);

describe("MobileNav", () => {
  it("starts closed and opens and closes from the labelled button", async () => {
    render(<MobileNav />);
    const button = screen.getByRole("button", { name: "Open menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Metrics" })).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Disputes" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Demo mode · simulated provider")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("link", { name: "Metrics" })).not.toBeInTheDocument();
  });

  it("closes on Escape and after choosing a link", async () => {
    render(<MobileNav />);
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await userEvent.click(screen.getByRole("link", { name: "Metrics" }));
    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
  });
});
