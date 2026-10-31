import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local");
}

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

// Reuse one client across dev hot reloads so we don't exhaust connections.
export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Works for both the global client and the `tx` handed to a $transaction
 * callback (the global client is assignable to the Omit-ed transaction type).
 * Repositories take this as an optional last parameter, defaulting to prisma.
 */
export type DbClient = Prisma.TransactionClient;

/**
 * Runs fn atomically. Given the global client it opens a transaction; given a
 * transaction client (which has no $transaction, and Prisma does not nest) it
 * joins the caller's transaction. Lets a repository function that needs its own
 * all-or-nothing steps keep working both standalone and inside a service.
 */
export function runAtomic<T>(
  db: DbClient,
  fn: (db: DbClient) => Promise<T>,
): Promise<T> {
  return "$transaction" in db
    ? (db as PrismaClient).$transaction((tx) => fn(tx))
    : fn(db);
}
