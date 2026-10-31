import type { ReactNode } from "react";
import { MAIN_CONTENT_ID } from "@/components/shell/SkipLink";

/** The one page wrapper: every page uses it, so every page shares one max width and one skip-link target. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main
      id={MAIN_CONTENT_ID}
      tabIndex={-1}
      className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 focus:outline-none sm:px-6 lg:px-8"
    >
      {children}
    </main>
  );
}
