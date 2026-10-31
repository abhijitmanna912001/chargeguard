// Test-only helpers for the database integration tests. Not imported by app code.
import type { ApprovalRequest, Dispute, Recommendation } from "../../contracts";

/**
 * Returns the database name from a Postgres URL and throws unless it ends with
 * "_test". Fails closed: an unparseable URL, an empty name or a missing URL all
 * throw, so a destructive reset can never run against an unknown database.
 */
export function assertTestDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error("Refusing to reset: database URL is not set");
  }
  let name: string;
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    // Deliberately do not echo the URL: it contains credentials.
    throw new Error("Refusing to reset: could not parse the database URL");
  }
  if (!name.endsWith("_test")) {
    throw new Error(
      `Refusing to reset: database name "${name}" does not end with "_test"`,
    );
  }
  return name;
}

/**
 * Empties all six tables. The guard runs against DATABASE_URL, which is the URL
 * lib/db/prisma.ts connects with, so it checks the database actually in use.
 * prisma is imported lazily so this module stays importable without a database.
 */
export async function resetDatabase(): Promise<void> {
  assertTestDatabaseUrl(process.env.DATABASE_URL);
  const { prisma } = await import("./prisma");
  // Constant tagged template, one statement. Table names are the Prisma model
  // names because the schema has no @@map.
  await prisma.$executeRaw`TRUNCATE TABLE "ActionLog", "Submission", "ApprovalRequest", "Recommendation", "Evidence", "Dispute" CASCADE`;
}

// ---- Pure builders (no database) ----
export function buildDispute(id: string): Dispute {
  return {
    id,
    transactionId: `txn_${id}`,
    amount: 49900,
    reasonCode: "13.1",
    deadline: "2026-12-01T00:00:00.000Z",
    createdAt: "2026-11-01T00:00:00.000Z",
    status: "received",
    evidence: [],
  };
}

export function buildRecommendation(
  id: string,
  disputeId: string,
  createdAt = "2026-11-02T00:00:00.000Z",
): Recommendation {
  return {
    id,
    disputeId,
    createdAt,
    modelOutput: null,
    finalAction: "escalate",
    flags: ["model_failure"],
  };
}

export function buildPendingApproval(
  id: string,
  disputeId: string,
  recommendationId: string,
): ApprovalRequest {
  return {
    id,
    disputeId,
    recommendationId,
    requestedAt: "2026-11-03T00:00:00.000Z",
    flags: ["model_failure"],
    proposedAction: "escalate",
    status: "pending",
  };
}
