import type { DefensePackage } from "@/contracts";
import { formatPaise } from "@/lib/format";

export function DefensePackageCard({ pkg }: { pkg: DefensePackage }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
        Defense package preview
      </h3>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        This is what would be sent to the simulated payment provider. Nothing goes to a real Paytm service.
      </p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-zinc-600 dark:text-zinc-400">Amount</dt>
        <dd>{formatPaise(pkg.amountPaise)}</dd>
        <dt className="text-zinc-600 dark:text-zinc-400">Reason code</dt>
        <dd>{pkg.reasonCode}</dd>
        <dt className="text-zinc-600 dark:text-zinc-400">Summary</dt>
        <dd className="break-words">{pkg.summary}</dd>
        <dt className="text-zinc-600 dark:text-zinc-400">Evidence</dt>
        <dd>
          {pkg.evidenceRefs.length === 0 ? (
            "No evidence references"
          ) : (
            <ul className="flex flex-wrap gap-2">
              {pkg.evidenceRefs.map((ref) => (
                <li key={ref} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                  {ref}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
    </div>
  );
}
