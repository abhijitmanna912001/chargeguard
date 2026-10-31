import "server-only";
import {
  countApprovalsByOutcome,
  countDisputesByStatus,
  listSecondsToDecision,
} from "@/lib/db/repositories/metrics";
import { prisma, type DbClient } from "@/lib/db/prisma";
import {
  fillStatusCounts,
  summarizeApprovalOutcomes,
  summarizeDurations,
  type ApprovalOutcomeKey,
  type TimeToDecision,
} from "./aggregate";
import type { DisputeStatus } from "@/contracts";

export type OperationalMetrics = {
  totalDisputes: number;
  disputesByStatus: { status: DisputeStatus; count: number }[];
  approvalsByOutcome: { outcome: ApprovalOutcomeKey; count: number }[];
  timeToDecision: TimeToDecision;
};

/** Live numbers from the database. Three independent queries, run in parallel; never cached. */
export async function getOperationalMetrics(db: DbClient = prisma): Promise<OperationalMetrics> {
  const [statusRows, approvalRows, seconds] = await Promise.all([
    countDisputesByStatus(db),
    countApprovalsByOutcome(db),
    listSecondsToDecision(db),
  ]);
  const disputesByStatus = fillStatusCounts(statusRows);
  return {
    totalDisputes: disputesByStatus.reduce((sum, r) => sum + r.count, 0),
    disputesByStatus,
    approvalsByOutcome: summarizeApprovalOutcomes(approvalRows),
    timeToDecision: summarizeDurations(seconds),
  };
}
