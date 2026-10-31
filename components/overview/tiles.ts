import type { DisputeStatus } from "@/contracts";

export type Tile = { key: string; label: string; count: number; hint: string };

type StatusCount = { status: DisputeStatus; count: number };

const sum = (rows: readonly StatusCount[], statuses: readonly DisputeStatus[]) =>
  rows.filter((r) => statuses.includes(r.status)).reduce((n, r) => n + r.count, 0);

/** The four tiles on the Overview page, from per-status counts. */
export function overviewTiles(rows: readonly StatusCount[]): Tile[] {
  return [
    { key: "received", label: "Received", count: sum(rows, ["received"]), hint: "Not looked at by the agent yet" },
    { key: "awaiting", label: "Awaiting approval", count: sum(rows, ["awaiting_approval"]), hint: "Waiting for your decision" },
    { key: "decided", label: "Decided or submitted", count: sum(rows, ["decided", "submitted"]), hint: "A response is ready or sent" },
    { key: "escalated", label: "Escalated", count: sum(rows, ["escalated"]), hint: "Handed to a person" },
  ];
}
