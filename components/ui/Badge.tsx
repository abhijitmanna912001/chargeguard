import type { ReactNode } from "react";
import { TONE_CLASSES, type Tone } from "./tones";

type Props = { tone?: Tone; icon?: ReactNode; children: ReactNode };

/** A small pill. The text always carries the meaning; the tone is a second cue. */
export function Badge({ tone = "neutral", icon, children }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}
