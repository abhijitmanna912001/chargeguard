import { BLOCKING_FLAGS, type Flag, type Recommendation } from "@/contracts";
import { humanizeEnum } from "@/lib/format";
import { ActionBadge } from "./ActionBadge";

const isBlocking = (flag: Flag) => BLOCKING_FLAGS.includes(flag);

export function hasModelFailure(rec: Recommendation): boolean {
  return rec.modelOutput === null || rec.flags.includes("model_failure");
}

// Blocking is stated in words ("Blocking") and by border style, never colour alone.
function FlagChip({ flag }: { flag: Flag }) {
  const blocking = isBlocking(flag);
  return (
    <li
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${
        blocking
          ? "border-2 border-red-600 bg-red-50 text-red-900 dark:border-red-400 dark:bg-red-950 dark:text-red-100"
          : "border-dashed border-zinc-500 text-zinc-800 dark:text-zinc-200"
      }`}
    >
      {humanizeEnum(flag)}
      {blocking && <span className="font-bold uppercase tracking-wide">· Blocking</span>}
    </li>
  );
}

export function RecommendationCard({ recommendation, isMock }: { recommendation: Recommendation; isMock: boolean }) {
  const { modelOutput, finalAction, flags, overrideReason } = recommendation;
  const failed = hasModelFailure(recommendation);
  const hasBlocking = flags.some(isBlocking);

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          Agent recommendation
        </h3>
        <ActionBadge action={finalAction} />
        {isMock && (
          <span className="rounded border border-dashed border-zinc-500 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
            Mock
          </span>
        )}
        {modelOutput && !failed && (
          <span className="text-sm tabular-nums">Confidence {Math.round(modelOutput.confidence * 100)}%</span>
        )}
      </div>

      {failed ? (
        <p className="mt-3 text-sm font-medium">
          The agent could not produce a recommendation. This case needs a person to decide.
        </p>
      ) : (
        modelOutput && (
          <>
            <p className="mt-3 text-sm">{modelOutput.reasoning}</p>
            {modelOutput.action !== finalAction && (
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                The model suggested {modelOutput.action}, but the rules changed it to {finalAction}
                {overrideReason ? `: ${overrideReason}` : "."}
              </p>
            )}
          </>
        )
      )}

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">Flags</h4>
        {flags.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">No flags.</p>
        ) : (
          <>
            <ul aria-label="Flags" className="mt-1.5 flex flex-wrap gap-2">
              {flags.map((flag) => (
                <FlagChip key={flag} flag={flag} />
              ))}
            </ul>
            {hasBlocking && (
              <p className="mt-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                Blocking flags mean the rules do not allow defending this dispute automatically.
              </p>
            )}
          </>
        )}
      </div>

      {modelOutput && modelOutput.evidenceRefs.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
            Evidence referenced
          </h4>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {modelOutput.evidenceRefs.map((ref) => (
              <li key={ref} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                {ref}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
