// Append-only is enforced HERE: this module exports only appendActionLog and
// listActionLog. There is no update or delete function, and there must never be
// one. (A DB-level trigger is deferred.)
import type { ActionLogEntry } from "../../../contracts";
import { actionLogFromRow, actionLogToCreateData } from "../mappers";
import { prisma } from "../prisma";

export async function appendActionLog(
  entry: ActionLogEntry,
): Promise<ActionLogEntry> {
  const row = await prisma.actionLog.create({
    data: actionLogToCreateData(entry),
  });
  return actionLogFromRow(row);
}

export async function listActionLog(
  disputeId: string,
): Promise<ActionLogEntry[]> {
  const rows = await prisma.actionLog.findMany({
    where: { disputeId },
    orderBy: [{ timestamp: "asc" }, { id: "asc" }],
  });
  return rows.map(actionLogFromRow);
}
