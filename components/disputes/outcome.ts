import type { Tone } from "@/components/ui/tones";
import { humanizeEnum } from "@/lib/format";

/** "evidence_flags_raised" -> "Evidence flags raised". "model_failure:timeout" -> "Model failure: timeout". */
export function outcomeLabel(outcome: string): string {
  return humanizeEnum(outcome.replace(":", ": "));
}

/** Only failures get a colour; everything else stays neutral so the log is not a wall of tones. */
export function outcomeTone(outcome: string): Tone {
  return /fail|error/i.test(outcome) ? "danger" : "neutral";
}
