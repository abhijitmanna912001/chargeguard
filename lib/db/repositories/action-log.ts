// Append-only is enforced HERE: this module exports only appendActionLog and
// listActionLog. There is no update or delete function, and there must never be
// one. (A DB-level trigger is deferred.)
import type { ActionLogEntry } from "../../../contracts";
import { actionLogFromRow, actionLogToCreateData } from "../mappers";
import { prisma, type DbClient } from "../prisma";

export async function appendActionLog(
  entry: ActionLogEntry,
  db: DbClient = prisma,
): Promise<ActionLogEntry> {
  const row = await db.actionLog.create({
    data: actionLogToCreateData(entry),
  });
  return actionLogFromRow(row);
}

/**
 * Oldest first. Entries of one agent run share a timestamp and ids are random,
 * so `seq` (insertion order) breaks ties. Served by (disputeId, timestamp, seq).
 */
export async function listActionLog(
  disputeId: string,
  db: DbClient = prisma,
): Promise<ActionLogEntry[]> {
  const rows = await db.actionLog.findMany({
    where: { disputeId },
    orderBy: [{ timestamp: "asc" }, { seq: "asc" }],
  });
  return rows.map(actionLogFromRow);
}

/**
 * The newest entries across all disputes, newest first (seq breaks timestamp
 * ties). One query, capped: limit must be an integer from 1 to 100.
 */
export async function listRecentActionLog(
  limit: number,
  db: DbClient = prisma,
): Promise<ActionLogEntry[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("limit must be an integer from 1 to 100");
  }
  const rows = await db.actionLog.findMany({
    orderBy: [{ timestamp: "desc" }, { seq: "desc" }],
    take: limit,
  });
  return rows.map(actionLogFromRow);
}
