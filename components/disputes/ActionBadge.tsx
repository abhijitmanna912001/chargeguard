import type { Action } from "@/contracts";

const ACTION: Record<Action, { label: string; className: string }> = {
  defend: {
    label: "Defend",
    className: "border-indigo-500 bg-indigo-50 text-indigo-900 dark:border-indigo-400 dark:bg-indigo-950 dark:text-indigo-100",
  },
  accept: {
    label: "Accept",
    className: "border-slate-500 bg-slate-100 text-slate-900 dark:border-slate-400 dark:bg-slate-800 dark:text-slate-100",
  },
  escalate: {
    label: "Escalate",
    className: "border-orange-500 bg-orange-50 text-orange-900 dark:border-orange-400 dark:bg-orange-950 dark:text-orange-100",
  },
};

export function ActionBadge({ action }: { action: Action }) {
  const { label, className } = ACTION[action];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}
