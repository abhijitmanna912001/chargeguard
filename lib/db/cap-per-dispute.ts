import type { ActionLogEntry } from "../../contracts";

/** Keeps the first `perDispute` entries of each dispute, in order, up to `limit` entries. Pure. */
export function capPerDispute(
  entries: readonly ActionLogEntry[],
  perDispute: number,
  limit: number,
): ActionLogEntry[] {
  const seen = new Map<string, number>();
  const out: ActionLogEntry[] = [];
  for (const entry of entries) {
    const n = seen.get(entry.disputeId) ?? 0;
    if (n >= perDispute) continue;
    seen.set(entry.disputeId, n + 1);
    out.push(entry);
    if (out.length === limit) break;
  }
  return out;
}
