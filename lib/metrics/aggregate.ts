// Pure helpers for the operations metrics. No database, no Next.
import { DisputeStatusSchema } from "@/contracts";
import type { DisputeStatus } from "@/contracts";

export type ApprovalOutcomeKey = "pending" | "approved_defend" | "approved_accept" | "rejected";

export const APPROVAL_OUTCOME_ORDER: readonly ApprovalOutcomeKey[] = [
  "pending",
  "approved_defend",
  "approved_accept",
  "rejected",
];

/** Every status in contract order, with 0 for the ones that have no disputes. */
export function fillStatusCounts(
  rows: readonly { status: DisputeStatus; count: number }[],
): { status: DisputeStatus; count: number }[] {
  const byStatus = new Map<DisputeStatus, number>();
  for (const r of rows) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + r.count);
  return DisputeStatusSchema.options.map((status) => ({ status, count: byStatus.get(status) ?? 0 }));
}

/** Collapses (status, resolvedAction) groups into the four outcomes a person cares about. */
export function summarizeApprovalOutcomes(
  rows: readonly { status: "pending" | "approved" | "rejected"; resolvedAction: "defend" | "accept" | null; count: number }[],
): { outcome: ApprovalOutcomeKey; count: number }[] {
  const totals: Record<ApprovalOutcomeKey, number> = {
    pending: 0,
    approved_defend: 0,
    approved_accept: 0,
    rejected: 0,
  };
  for (const r of rows) {
    if (r.status === "pending") totals.pending += r.count;
    else if (r.status === "rejected") totals.rejected += r.count;
    else if (r.resolvedAction === "defend") totals.approved_defend += r.count;
    else if (r.resolvedAction === "accept") totals.approved_accept += r.count;
  }
  return APPROVAL_OUTCOME_ORDER.map((outcome) => ({ outcome, count: totals[outcome] }));
}

export type TimeToDecision = { count: number; medianSeconds: number | null; maxSeconds: number | null };

/** Median and max of the durations. Negative or non-finite values are dropped. */
export function summarizeDurations(seconds: readonly number[]): TimeToDecision {
  const valid = seconds.filter((s) => Number.isFinite(s) && s >= 0).sort((a, b) => a - b);
  if (valid.length === 0) return { count: 0, medianSeconds: null, maxSeconds: null };
  const mid = Math.floor(valid.length / 2);
  const median = valid.length % 2 === 1 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
  return { count: valid.length, medianSeconds: median, maxSeconds: valid[valid.length - 1] };
}

/** 45 -> "45 s", 150 -> "2 min 30 s", 7260 -> "2 h 1 min". */
export function formatSeconds(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    const s = total % 60;
    return s === 0 ? `${minutes} min` : `${minutes} min ${s} s`;
  }
  const hours = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${hours} h` : `${hours} h ${m} min`;
}
