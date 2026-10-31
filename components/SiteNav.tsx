"use client";

import { ChartColumn, FileWarning, LayoutDashboard, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: readonly { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/", label: "Overview", Icon: LayoutDashboard },
  { href: "/disputes", label: "Disputes", Icon: FileWarning },
  { href: "/metrics", label: "Metrics", Icon: ChartColumn },
];

function isCurrent(pathname: string | null, href: string): boolean {
  return pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
}

/**
 * The links alone, so the layout can show them (with nothing marked) while the
 * pathname is unknown. The current page is marked in text weight and a filled
 * background as well as aria-current, never by colour alone.
 */
export function NavLinks({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {LINKS.map(({ href, label, Icon }) => {
        const current = isCurrent(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              onClick={onNavigate}
              className={`flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                current
                  ? "bg-accent-soft font-semibold text-accent-ink"
                  : "font-medium text-ink-muted hover:bg-canvas hover:text-ink"
              }`}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// usePathname needs Suspense under Cache Components on routes with dynamic
// params (/disputes/[id]); the shell wraps this component for that reason.
export function SiteNav({ onNavigate }: { onNavigate?: () => void }) {
  return <NavLinks pathname={usePathname()} onNavigate={onNavigate} />;
}
