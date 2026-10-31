// Run with: npm run db:reset-demo -- --yes
// WIPES every row in the database named by DATABASE_URL (.env.local), then runs
// the same seeding as `npm run db:seed`. This is the DEV database, so it refuses
// to do anything unless called with --yes. Only the database name and host are
// printed, never the credentials.
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set in .env.local");
  process.exit(1);
}

let dbName;
let host;
try {
  const parsed = new URL(url);
  dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  host = parsed.host;
} catch {
  // Do not echo the URL: it contains the password.
  console.error("Could not parse DATABASE_URL");
  process.exit(1);
}
if (!dbName) {
  console.error("DATABASE_URL has no database name");
  process.exit(1);
}

console.log(`About to wipe all data in database "${dbName}" on ${host}.`);
if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes. Nothing was changed.");
  console.error("Run: npm run db:reset-demo -- --yes");
  process.exit(1);
}

// Table names are the Prisma model names (the schema has no @@map).
const truncate = spawnSync("npx", ["prisma", "db", "execute", "--stdin"], {
  input: 'TRUNCATE TABLE "ActionLog", "Submission", "ApprovalRequest", "Recommendation", "Evidence", "Dispute" CASCADE;',
  stdio: ["pipe", "inherit", "inherit"],
});
if (truncate.status !== 0) {
  console.error("Truncate failed; the database was not seeded.");
  process.exit(truncate.status ?? 1);
}
console.log("Tables emptied. Seeding...");

const seed = spawnSync("npm", ["run", "db:seed"], { stdio: "inherit" });
process.exit(seed.status ?? 1);
