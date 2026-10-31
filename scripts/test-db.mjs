// Runs the database integration tests against chargeguard_test.
// Reads DATABASE_URL from .env.local (no password lives in package.json or here),
// swaps only the database name for chargeguard_test, then runs vitest on
// *.db.test.ts. The dev database is never touched: the tests and resetDatabase()
// both refuse any database whose name does not end in _test.
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const devUrl = process.env.DATABASE_URL;
if (!devUrl) {
  console.error("DATABASE_URL is not set in .env.local");
  process.exit(1);
}
const url = new URL(devUrl);
url.pathname = "/chargeguard_test";

// Files must run one at a time: every test resets the same database, so parallel
// files would truncate each other's rows mid-test.
const result = spawnSync("npx", ["vitest", "run", ".db.test.ts", "--no-file-parallelism", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, TEST_DATABASE_URL: url.toString() },
});
process.exit(result.status ?? 1);
