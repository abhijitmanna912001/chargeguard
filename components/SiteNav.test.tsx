// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/disputes" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import { NavLinks, SiteNav } from "./SiteNav";

afterEach(cleanup);

describe("SiteNav", () => {
  it("marks Metrics as the current page on /metrics only", () => {
    pathname.value = "/metrics";
    render(<SiteNav />);
    expect(screen.getByRole("link", { name: "Metrics" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Disputes" })).not.toHaveAttribute("aria-current");
  });

  it("keeps Disputes current on a dispute detail page", () => {
    pathname.value = "/disputes/dsp_1";
    render(<SiteNav />);
    expect(screen.getByRole("link", { name: "Disputes" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Metrics" })).not.toHaveAttribute("aria-current");
  });

  it("marks nothing while the pathname is unknown (the Suspense fallback)", () => {
    render(<NavLinks pathname={null} />);
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(document.querySelector("[aria-current]")).toBeNull();
  });
});
