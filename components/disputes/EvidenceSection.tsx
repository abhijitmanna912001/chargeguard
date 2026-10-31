import type { Evidence } from "@/contracts";
import { groupEvidenceByType } from "@/lib/evidence-display";
import { EvidenceCard } from "./EvidenceCard";

export function EvidenceSection({ evidence }: { evidence: Evidence[] }) {
  const groups = groupEvidenceByType(evidence);
  return (
    <section aria-labelledby="evidence-heading" className="mt-10">
      <h2 id="evidence-heading" className="text-lg font-semibold">Evidence</h2>
      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No evidence collected yet.</p>
      ) : (
        groups.map((group) => (
          <section key={group.type} aria-labelledby={`evidence-${group.type}`} className="mt-5">
            <h3 id={`evidence-${group.type}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              {group.label} ({group.items.length})
            </h3>
            <ul className="grid gap-3 md:grid-cols-2">
              {group.items.map((item) => (
                <li key={item.id}>
                  <EvidenceCard evidence={item} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
