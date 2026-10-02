import { execSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.warn(
      "[yetim] DATABASE_URL is not set. This deploy will have no reports. Add the same Neon connection string in Vercel → Settings → Environment Variables, then redeploy.",
    );
    return;
  }

  function run(command) {
    execSync(command, { stdio: "inherit", env: process.env });
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      run("npx prisma migrate deploy");
      run("npx tsx prisma/seed.ts --if-empty");
      return;
    } catch (error) {
      console.warn(`[yetim] database setup attempt ${attempt} failed.`);
      if (attempt === 3) throw error;
      await delay(3_000);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
