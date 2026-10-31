import type { Evidence } from "@/contracts";
import { EmptyState } from "@/components/ui/EmptyState";
import { groupEvidenceByType } from "@/lib/evidence-display";
import { EvidenceCard } from "./EvidenceCard";

export function EvidenceSection({ evidence }: { evidence: Evidence[] }) {
  // One grid, ordered by type. Each card names its own type, so no group headings are needed.
  const items = groupEvidenceByType(evidence).flatMap((group) => group.items);
  return (
    // @container: the two-column grid follows the width this section actually
    // has (it shares the row with the action log from lg up), not the viewport.
    <section aria-labelledby="evidence-heading" className="@container">
      <h2 id="evidence-heading" className="text-lg font-semibold">Evidence</h2>
      {items.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="No evidence collected yet" />
        </div>
      ) : (
        <ul className="mt-3 grid gap-3 @xl:grid-cols-2">
          {items.map((item) => (
            <li key={item.id} className="min-w-0">
              <EvidenceCard evidence={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
