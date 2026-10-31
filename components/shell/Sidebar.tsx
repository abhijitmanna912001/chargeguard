import { Suspense } from "react";
import { NavLinks, SiteNav } from "@/components/SiteNav";
import { Brand } from "./Brand";
import { DemoBadge } from "./DemoBadge";

/** Fixed navigation column from the md breakpoint up. */
export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-line bg-surface p-4 md:sticky md:top-0 md:flex md:h-dvh md:overflow-y-auto">
      <div className="space-y-6">
        <div className="px-1 pt-1">
          <Brand />
        </div>
        <nav aria-label="Main">
          <Suspense fallback={<NavLinks pathname={null} />}>
            <SiteNav />
          </Suspense>
        </nav>
      </div>
      <DemoBadge />
    </aside>
  );
}
