import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const drizzleDir = join(import.meta.dirname, "..", "drizzle");

describe("drizzle migrations", () => {
  it("creates health document schema only once across migration files", () => {
    const sqlFiles = readdirSync(drizzleDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    const documentCreates = sqlFiles.flatMap((file) => {
      const content = readFileSync(join(drizzleDir, file), "utf8");
      const matches = content.match(/CREATE TABLE "health_documents"/g) ?? [];
      return matches.map(() => file);
    });

    expect(documentCreates).toEqual(["0007_health_documents.sql"]);
  });

  it("creates document enums only in the dedicated documents migration", () => {
    const sqlFiles = readdirSync(drizzleDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    const enumCreates = sqlFiles.flatMap((file) => {
      const content = readFileSync(join(drizzleDir, file), "utf8");
      const matches = content.match(/CREATE TYPE "public"\."document_type"/g) ?? [];
      return matches.map(() => file);
    });

    expect(enumCreates).toEqual(["0007_health_documents.sql"]);
  });

  it("keeps proposal intent additions in 0011 without duplicate document DDL", () => {
    const content = readFileSync(join(drizzleDir, "0011_regular_night_nurse.sql"), "utf8");

    expect(content).toContain("adapt_workout_plan_from_progress");
    expect(content).not.toContain("CREATE TABLE");
    expect(content).not.toContain("CREATE TYPE");
  });
});
