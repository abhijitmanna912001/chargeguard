import { ArrowUpRight, Check, ShieldCheck, type LucideIcon } from "lucide-react";
import type { Action } from "@/contracts";
import { TONE_CLASSES, type Tone } from "@/components/ui/tones";

const ACTION: Record<Action, { label: string; tone: Tone; Icon: LucideIcon }> = {
  defend: { label: "Defend", tone: "accent", Icon: ShieldCheck },
  accept: { label: "Accept", tone: "neutral", Icon: Check },
  escalate: { label: "Escalate", tone: "caution", Icon: ArrowUpRight },
};

/** The recommended action. `lg` is the prominent chip on the dispute page. */
export function ActionBadge({ action, size = "sm" }: { action: Action; size?: "sm" | "lg" }) {
  const { label, tone, Icon } = ACTION[action];
  const sizing = size === "lg" ? "gap-2 px-4 py-1.5 text-base font-semibold" : "gap-1 px-2 py-0.5 text-xs font-medium";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border ${sizing} ${TONE_CLASSES[tone]}`}>
      <Icon aria-hidden="true" className={size === "lg" ? "size-5" : "size-3.5"} />
      {label}
    </span>
  );
}
