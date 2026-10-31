import type { SubmissionResult } from "@/contracts";
import { formatDateTime, humanizeEnum } from "@/lib/format";

export function SubmissionResultCard({ submission }: { submission: SubmissionResult }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
        Simulated submission
      </h3>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-zinc-600 dark:text-zinc-400">Status</dt>
        <dd>{humanizeEnum(submission.status)}</dd>
        <dt className="text-zinc-600 dark:text-zinc-400">Provider reference (simulated)</dt>
        <dd className="font-mono break-all">{submission.providerRef ?? "None"}</dd>
        <dt className="text-zinc-600 dark:text-zinc-400">Submitted at</dt>
        <dd>
          {submission.submittedAt ? (
            <time dateTime={submission.submittedAt}>{formatDateTime(submission.submittedAt)}</time>
          ) : (
            "Not submitted"
          )}
        </dd>
      </dl>
    </div>
  );
}
