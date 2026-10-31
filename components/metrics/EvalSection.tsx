import { FlaskConical } from "lucide-react";
import type { EvalCaseResult } from "@/contracts";
import type { LoadEvalResult } from "@/lib/eval/load-results";
import { formatDateTime, humanizeEnum } from "@/lib/format";
import { ActionBadge } from "@/components/disputes/ActionBadge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

const th = "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted";
const td = "px-4 py-3 align-top text-sm";
const muted = "text-ink-muted";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <dt className="text-sm font-medium text-ink-muted">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold tabular-nums">{value}</dd>
    </Card>
  );
}

function CorrectLabel({ correct }: { correct: boolean }) {
  return correct ? (
    <span className="font-semibold text-success-fg">
      <span aria-hidden="true">✓ </span>Correct
    </span>
  ) : (
    <span className="font-semibold text-danger-fg">
      <span aria-hidden="true">✗ </span>Incorrect
    </span>
  );
}

const ms = (n: number) => `${n.toLocaleString("en-IN")} ms`;

function CaseRow({ c }: { c: EvalCaseResult }) {
  return (
    <tr>
      <th scope="row" className={`${td} text-left font-mono font-medium`}>{c.disputeId}</th>
      <td className={td}><ActionBadge action={c.expectedAction} /></td>
      <td className={td}>
        {c.modelAction ? <ActionBadge action={c.modelAction} /> : <span className={muted}>No answer (model failed)</span>}
      </td>
      <td className={td}><ActionBadge action={c.finalAction} /></td>
      <td className={td}><CorrectLabel correct={c.correct} /></td>
      <td className={`${td} tabular-nums`}>
        {c.confidence === null ? <span className={muted}>None</span> : `${Math.round(c.confidence * 100)}%`}
      </td>
      <td className={td}>
        {c.flags.length === 0 ? (
          <span className={muted}>None</span>
        ) : (
          <ul className="space-y-0.5">
            {c.flags.map((f) => <li key={f}>{humanizeEnum(f)}</li>)}
          </ul>
        )}
      </td>
      <td className={`${td} tabular-nums`}>{c.evidenceRequirementsMet} of {c.evidenceRequirementsTotal}</td>
      <td className={`${td} tabular-nums`}>{ms(c.latencyMs)}</td>
      <td className={`${td} tabular-nums`}>{c.attemptCount}</td>
      <td className={`${td} tabular-nums`}>
        {c.totalTokens === null ? <span className={muted}>Not reported</span> : c.totalTokens.toLocaleString("en-IN")}
      </td>
    </tr>
  );
}

/** Pure view of the loader result. All three states are plain text, no color-only meaning. */
export function EvalSection({ result }: { result: LoadEvalResult }) {
  if (result.status === "missing") {
    return (
      <EmptyState
        icon={<FlaskConical className="size-6" />}
        title="No evaluation results yet."
        description="Run npm run eval."
      />
    );
  }
  if (result.status === "invalid") {
    return (
      <p role="alert" className="rounded-lg border border-warning-line bg-warning-bg p-4 text-sm text-warning-fg">
        The evaluation results could not be shown. {result.message}
      </p>
    );
  }

  const { results } = result;
  const { summary } = results;
  return (
    <div className="space-y-4">
      <p className={`text-sm ${muted}`}>
        Generated <time dateTime={results.generatedAt}>{formatDateTime(results.generatedAt)}</time> with model{" "}
        <span className="font-mono">{results.model}</span>.
      </p>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Accuracy" value={`${Math.round(summary.accuracy * 100)}%`} />
        <Stat label="Correct" value={`${summary.correct} of ${summary.total}`} />
        <Stat label="Model failures" value={String(summary.modelFailures)} />
        <Stat label="Median latency" value={ms(summary.medianLatencyMs)} />
        <Stat label="Max latency" value={ms(summary.maxLatencyMs)} />
      </dl>
      <Card>
        <div role="region" aria-label="Per-case evaluation results" tabIndex={0} className="overflow-x-auto rounded-lg">
          <table className="w-full min-w-[64rem] border-collapse">
            <caption className={`px-4 py-3 text-left text-sm ${muted}`}>
              One row per demo fixture: what was expected, what the model said, and what the rules finally decided.
            </caption>
            <thead className="border-y border-line">
              <tr>
                <th scope="col" className={th}>Dispute</th>
                <th scope="col" className={th}>Expected</th>
                <th scope="col" className={th}>Model said</th>
                <th scope="col" className={th}>Final</th>
                <th scope="col" className={th}>Result</th>
                <th scope="col" className={th}>Confidence</th>
                <th scope="col" className={th}>Flags</th>
                <th scope="col" className={th}>Evidence met</th>
                <th scope="col" className={th}>Latency</th>
                <th scope="col" className={th}>Attempts</th>
                <th scope="col" className={th}>Tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {results.cases.map((c) => <CaseRow key={c.disputeId} c={c} />)}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
