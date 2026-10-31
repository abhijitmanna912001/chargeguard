import type { SubmissionResult } from "@/contracts";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Fact, FactList } from "@/components/ui/FactList";
import type { Tone } from "@/components/ui/tones";
import { formatDateTime, humanizeEnum } from "@/lib/format";

// A submitted response is not a won dispute, so "submitted" is accent, not success.
const toneFor = (status: SubmissionResult["status"]): Tone => (status === "failed" ? "danger" : status === "submitted" ? "accent" : "neutral");

export function SubmissionResultCard({ submission }: { submission: SubmissionResult }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Simulated submission</h3>
        <Badge tone={toneFor(submission.status)}>{humanizeEnum(submission.status)}</Badge>
      </div>
      <div className="mt-4">
        <FactList>
          <Fact label="Provider reference (simulated)">
            <span className="break-all font-mono">{submission.providerRef ?? "None"}</span>
          </Fact>
          <Fact label="Submitted at">
            {submission.submittedAt ? (
              <time dateTime={submission.submittedAt}>{formatDateTime(submission.submittedAt)}</time>
            ) : (
              "Not submitted"
            )}
          </Fact>
        </FactList>
      </div>
    </Card>
  );
}
