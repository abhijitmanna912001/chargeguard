"use client";

import { Menu, X } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { NavLinks, SiteNav } from "@/components/SiteNav";
import { Brand } from "./Brand";
import { DemoBadge } from "./DemoBadge";

const PANEL_ID = "mobile-nav-panel";

/** Top bar with a menu button, below the md breakpoint. The panel is in normal flow, so opening it pushes content down. */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const Icon = open ? X : Menu;
  return (
    <div className="sticky top-0 z-10 border-b border-line bg-surface md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Brand />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={PANEL_ID}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
          className="flex size-10 items-center justify-center rounded-lg border border-field-line text-ink hover:bg-canvas"
        >
          <Icon aria-hidden="true" className="size-5" />
        </button>
      </div>
      {open && (
        <div id={PANEL_ID} className="space-y-4 border-t border-line p-4">
          <nav aria-label="Main">
            <Suspense fallback={<NavLinks pathname={null} />}>
              <SiteNav onNavigate={() => setOpen(false)} />
            </Suspense>
          </nav>
          <DemoBadge />
        </div>
      )}
    </div>
  );
}
