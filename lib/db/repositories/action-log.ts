// Append-only is enforced HERE: this module exports only appendActionLog and
// listActionLog. There is no update or delete function, and there must never be
// one. (A DB-level trigger is deferred.)
import type { ActionLogEntry } from "../../../contracts";
import { capPerDispute } from "../cap-per-dispute";
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

const SCAN_WINDOW = 100;

/**
 * Newest entries across disputes, at most `perDispute` per dispute, at most
 * `limit` in total, newest first. One query over the newest SCAN_WINDOW rows;
 * if a single dispute fills the whole window the result can be shorter than
 * `limit`. Fine for an overview feed.
 */
export async function listRecentActionLogPerDispute(
  perDispute: number,
  limit: number,
  db: DbClient = prisma,
): Promise<ActionLogEntry[]> {
  if (!Number.isInteger(perDispute) || perDispute < 1 || perDispute > 10) {
    throw new RangeError("perDispute must be an integer from 1 to 10");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("limit must be an integer from 1 to 100");
  }
  const recent = await listRecentActionLog(SCAN_WINDOW, db);
  return capPerDispute(recent, perDispute, limit);
}
