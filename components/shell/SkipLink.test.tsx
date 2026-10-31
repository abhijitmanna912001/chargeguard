// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { PageShell } from "@/components/ui/PageShell";
import { MAIN_CONTENT_ID, SkipLink } from "./SkipLink";

afterEach(cleanup);

describe("SkipLink", () => {
  it("points at the id that PageShell puts on <main>", () => {
    render(
      <>
        <SkipLink />
        <PageShell>content</PageShell>
      </>,
    );
    const link = screen.getByRole("link", { name: "Skip to content" });
    expect(link).toHaveAttribute("href", `#${MAIN_CONTENT_ID}`);
    expect(screen.getByRole("main")).toHaveAttribute("id", MAIN_CONTENT_ID);
  });
});
