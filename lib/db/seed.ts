// Run with: npm run db:seed
//
// The script uses `tsx --conditions react-server` because prisma.ts imports
// "server-only", which throws when resolved under the default condition (it
// only works inside the Next.js server bundle). The "react-server" condition
// makes Node resolve the package's no-op entry instead, so the same repository
// code runs outside Next. Do not import this file from the app.
import { config } from "dotenv";

async function main() {
  // tsx does not load .env.local. Load it before prisma.ts reads DATABASE_URL,
  // which is why the app modules are imported dynamically below.
  config({ path: ".env.local", quiet: true });

  const { cases } = await import("../../fixtures/cases");
  const { createDisputeWithEvidence } = await import("./repositories/disputes");
  const { prisma } = await import("./prisma");

  try {
    for (const { dispute } of cases) {
      await createDisputeWithEvidence(dispute);
    }
    console.log(`Seeded ${cases.length} dispute(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
