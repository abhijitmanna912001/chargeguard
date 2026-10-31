import { FlaskConical } from "lucide-react";

export function DemoBadge() {
  return (
    <p className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-xs font-medium text-ink-muted">
      <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
      Demo mode · simulated provider
    </p>
  );
}
