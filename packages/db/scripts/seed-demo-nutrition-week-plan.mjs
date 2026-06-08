/* global process, console */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the demo nutrition week-plan.");
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const seedSql = readFileSync(
  join(scriptDir, "../drizzle/seeds/demo-nutrition-week-plan.sql"),
  "utf8",
);
const sql = postgres(databaseUrl);

try {
  await sql.unsafe(seedSql);
  console.log("Demo nutrition week-plan seed applied.");
} finally {
  await sql.end({ timeout: 5 });
}
