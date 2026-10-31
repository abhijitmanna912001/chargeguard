"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/disputes", label: "Disputes" },
  { href: "/metrics", label: "Metrics" },
] as const;

function isCurrent(pathname: string | null, href: string): boolean {
  return pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
}

/** The links alone, so the layout can show them (with nothing marked) while the pathname is unknown. */
export function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <ul className="flex items-center gap-4 text-sm">
      {LINKS.map(({ href, label }) => {
        const current = isCurrent(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              className={`rounded px-1 py-0.5 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
                current ? "font-semibold underline decoration-2" : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// usePathname needs Suspense under Cache Components on routes with dynamic
// params (/disputes/[id]); the layout wraps this component for that reason.
export function SiteNav() {
  return <NavLinks pathname={usePathname()} />;
}
