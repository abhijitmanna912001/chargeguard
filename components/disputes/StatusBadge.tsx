import type { DisputeStatus } from "@/contracts";

// Each badge carries its meaning in text; colour is only a secondary cue.
// "submitted" is deliberately neutral: a submitted response is not a won dispute.
const STATUS: Record<DisputeStatus, { label: string; className: string }> = {
  received: {
    label: "Received",
    className: "border-zinc-400 bg-zinc-100 text-zinc-800 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100",
  },
  gathering: {
    label: "Gathering evidence",
    className: "border-sky-500 bg-sky-50 text-sky-900 dark:border-sky-400 dark:bg-sky-950 dark:text-sky-100",
  },
  decided: {
    label: "Decided",
    className: "border-indigo-500 bg-indigo-50 text-indigo-900 dark:border-indigo-400 dark:bg-indigo-950 dark:text-indigo-100",
  },
  awaiting_approval: {
    label: "Awaiting approval",
    className: "border-amber-500 bg-amber-50 text-amber-900 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-100",
  },
  submitted: {
    label: "Response submitted",
    className: "border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-100",
  },
  accepted: {
    label: "Accepted",
    className: "border-slate-500 bg-slate-100 text-slate-900 dark:border-slate-400 dark:bg-slate-800 dark:text-slate-100",
  },
  escalated: {
    label: "Escalated",
    className: "border-orange-500 bg-orange-50 text-orange-900 dark:border-orange-400 dark:bg-orange-950 dark:text-orange-100",
  },
  expired: {
    label: "Expired",
    className: "border-red-500 bg-red-50 text-red-900 dark:border-red-400 dark:bg-red-950 dark:text-red-100",
  },
};

export function StatusBadge({ status }: { status: DisputeStatus }) {
  const { label, className } = STATUS[status];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
