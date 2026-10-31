// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/disputes" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import { NavLinks, SiteNav } from "./SiteNav";

afterEach(cleanup);

const current = () => screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page").map((l) => l.textContent);

describe("SiteNav", () => {
  it("marks Metrics as the current page on /metrics only", () => {
    pathname.value = "/metrics";
    render(<SiteNav />);
    expect(current()).toEqual(["Metrics"]);
  });

  it("marks Overview on / and not on other pages", () => {
    pathname.value = "/";
    render(<SiteNav />);
    expect(current()).toEqual(["Overview"]);
  });

  it("keeps Disputes current on a dispute detail page", () => {
    pathname.value = "/disputes/dsp_1";
    render(<SiteNav />);
    expect(current()).toEqual(["Disputes"]);
  });

  it("marks nothing while the pathname is unknown (the Suspense fallback)", () => {
    render(<NavLinks pathname={null} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(current()).toEqual([]);
  });
});
