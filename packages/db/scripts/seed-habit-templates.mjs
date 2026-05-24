/* global process, console */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed habit templates.");
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const seedSql = readFileSync(join(scriptDir, "../drizzle/seeds/habit-templates.sql"), "utf8");
const sql = postgres(databaseUrl);

try {
  await sql.unsafe(seedSql);
  console.log("Habit template catalog seed applied (existing rows were left unchanged).");
} finally {
  await sql.end({ timeout: 5 });
}
