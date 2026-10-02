import { existsSync, readFileSync } from "node:fs";

if (!existsSync(".env")) {
  console.error(
    "Missing .env.\nCopy .env.example to .env and set DATABASE_URL.\nPrisma does not read .env.example.",
  );
  process.exit(1);
}

const text = readFileSync(".env", "utf8");
const line = text.split(/\r?\n/).find((entry) => /^\s*DATABASE_URL\s*=/.test(entry));
const value = (line ?? "")
  .replace(/^\s*DATABASE_URL\s*=\s*/, "")
  .trim()
  .replace(/^["']|["']$/g, "");

if (!value) {
  console.error(
    "DATABASE_URL in .env is empty.\nPaste your Neon connection string into .env, save, then run this command again.\nKeep the real password out of .env.example.",
  );
  process.exit(1);
}
