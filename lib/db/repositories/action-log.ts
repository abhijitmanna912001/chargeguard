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
