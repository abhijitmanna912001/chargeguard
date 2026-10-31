import { OctagonAlert } from "lucide-react";
import { useId } from "react";
import { BLOCKING_FLAGS, type Flag, type Recommendation } from "@/contracts";
import { Card } from "@/components/ui/Card";
import { humanizeEnum } from "@/lib/format";
import { ActionBadge } from "./ActionBadge";
import { MockTag } from "./MockTag";

const isBlocking = (flag: Flag) => BLOCKING_FLAGS.includes(flag);

export function hasModelFailure(rec: Recommendation): boolean {
  return rec.modelOutput === null || rec.flags.includes("model_failure");
}

const heading = "text-xs font-semibold uppercase tracking-wide text-ink-muted";

// Blocking is stated in words ("Blocking"), by a solid fill and an icon, never colour alone.
function FlagChip({ flag }: { flag: Flag }) {
  const blocking = isBlocking(flag);
  return (
    <li
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
        blocking
          ? "border-danger-solid bg-danger-solid font-semibold text-ink-on"
          : "border-warning-line bg-warning-bg font-medium text-warning-fg"
      }`}
    >
      {blocking && <OctagonAlert aria-hidden="true" className="size-3.5" />}
      {humanizeEnum(flag)}
      {blocking && <span className="font-bold uppercase tracking-wide">Blocking</span>}
    </li>
  );
}

/** A labelled meter. The percentage is also written out, so the bar is never the only cue. */
function ConfidenceMeter({ value }: { value: number }) {
  const labelId = useId();
  const pct = Math.round(value * 100);
  return (
    <div className="max-w-xs">
      <p id={labelId} className="text-sm font-medium tabular-nums">{`Confidence ${pct}%`}</p>
      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%`}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-bg"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function RecommendationCard({ recommendation, isMock }: { recommendation: Recommendation; isMock: boolean }) {
  const { modelOutput, finalAction, flags, overrideReason } = recommendation;
  const failed = hasModelFailure(recommendation);
  const hasBlocking = flags.some(isBlocking);

  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className={heading}>Agent recommendation</h3>
        {isMock && <MockTag />}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <p className="mb-1.5 text-sm text-ink-muted">Recommended action</p>
          <ActionBadge action={finalAction} size="lg" />
        </div>
        {modelOutput && !failed && <ConfidenceMeter value={modelOutput.confidence} />}
      </div>

      {failed ? (
        <p className="text-sm font-medium">
          The agent could not produce a recommendation. This case needs a person to decide.
        </p>
      ) : (
        modelOutput && (
          <div>
            <h4 className={heading}>Rationale</h4>
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed">{modelOutput.reasoning}</p>
            {modelOutput.action !== finalAction && (
              <p className="mt-2 max-w-prose text-sm text-ink-muted">
                The model suggested {modelOutput.action}, but the rules changed it to {finalAction}
                {overrideReason ? `: ${overrideReason}` : "."}
              </p>
            )}
          </div>
        )
      )}

      <div>
        <h4 className={heading}>Flags</h4>
        {flags.length === 0 ? (
          <p className="mt-1.5 text-sm text-ink-muted">No flags.</p>
        ) : (
          <>
            <ul aria-label="Flags" className="mt-1.5 flex flex-wrap gap-2">
              {flags.map((flag) => (
                <FlagChip key={flag} flag={flag} />
              ))}
            </ul>
            {hasBlocking && (
              <p className="mt-2 text-sm text-ink-muted">
                Blocking flags mean the rules do not allow defending this dispute automatically.
              </p>
            )}
          </>
        )}
      </div>

      {modelOutput && modelOutput.evidenceRefs.length > 0 && (
        <div>
          <h4 className={heading}>Evidence referenced</h4>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {modelOutput.evidenceRefs.map((ref) => (
              <li key={ref} className="rounded-md border border-line bg-canvas px-2 py-0.5 font-mono text-xs text-ink-muted">
                {ref}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
