import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaReportRepository } from "../lib/server/prisma-repository";
import { buildSeedReports } from "../lib/server/seed-data";

// The Prisma CLI loads .env on its own. tsx does not, so seed would see an empty URL.
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  const prisma = new PrismaClient();
  const onlyIfEmpty = process.argv.includes("--if-empty");
  try {
    if (onlyIfEmpty) {
      const existing = await prisma.report.count();
      if (existing > 0) {
        console.log(`Database already has ${existing} reports. Seed skipped.`);
        return;
      }
    }
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
