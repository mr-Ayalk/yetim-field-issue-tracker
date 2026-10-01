import { PrismaClient } from "@prisma/client";
import { PrismaReportRepository } from "../lib/server/prisma-repository";
import { buildSeedReports } from "../lib/server/seed-data";

async function main() {
  const prisma = new PrismaClient();
  try {
    const count = await new PrismaReportRepository(prisma).resetAndSeed(buildSeedReports());
    console.log(`Seeded ${count} Yetim demonstration reports.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
