import type { ReactNode } from "react";

/** The one page wrapper: every page uses it, so every page shares one max width. */
export function PageShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>;
}
