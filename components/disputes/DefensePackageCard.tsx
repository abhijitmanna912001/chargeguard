import type { DefensePackage } from "@/contracts";
import { Card } from "@/components/ui/Card";
import { Fact, FactList } from "@/components/ui/FactList";
import { formatPaise } from "@/lib/format";
import { reasonLabel } from "@/lib/reason-codes";

export function DefensePackageCard({ pkg }: { pkg: DefensePackage }) {
  return (
    <Card className="p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Defense package preview</h3>
      <p className="mt-2 text-sm text-ink-muted">
        This is what would be sent to the simulated payment provider. Nothing goes to a real Paytm service.
      </p>
      <div className="mt-4">
        <FactList>
          <Fact label="Amount">{formatPaise(pkg.amountPaise)}</Fact>
          <Fact label="Reason">{reasonLabel(pkg.reasonCode)}</Fact>
          <Fact label="Summary">{pkg.summary}</Fact>
          <Fact label="Evidence">
            {pkg.evidenceRefs.length === 0 ? (
              "No evidence references"
            ) : (
              <ul className="flex flex-wrap gap-2">
                {pkg.evidenceRefs.map((ref) => (
                  <li key={ref} className="rounded-md border border-line bg-canvas px-2 py-0.5 font-mono text-xs text-ink-muted">
                    {ref}
                  </li>
                ))}
              </ul>
            )}
          </Fact>
        </FactList>
      </div>
    </Card>
  );
}
