import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const drizzleDir = join(import.meta.dirname, "..", "drizzle");
const journalPath = join(drizzleDir, "meta", "_journal.json");

type JournalEntry = {
  idx: number;
  tag: string;
  when: number;
};

function readJournalEntries(): JournalEntry[] {
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: JournalEntry[];
  };
  return journal.entries;
}

function readRootSqlMigrationFiles(): string[] {
  return readdirSync(drizzleDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

describe("drizzle migrations", () => {
  it("keeps journal idx sequence contiguous from zero", () => {
    const entries = readJournalEntries();
    expect(entries.map((entry) => entry.idx)).toEqual(
      entries.map((_, index) => index),
    );
  });

  it("matches journal tags to root sql migration files bidirectionally", () => {
    const entries = readJournalEntries();
    const sqlFiles = readRootSqlMigrationFiles();
    const tags = entries.map((entry) => entry.tag);

    expect(new Set(tags).size).toBe(tags.length);

    for (const entry of entries) {
      expect(sqlFiles).toContain(`${entry.tag}.sql`);
    }

    for (const file of sqlFiles) {
      expect(tags).toContain(file.replace(/\.sql$/, ""));
    }
  });

  it("keeps journal when timestamps monotonic by idx order", () => {
    const entries = readJournalEntries();
    const whenValues = entries.map((entry) => entry.when);

    for (let index = 1; index < whenValues.length; index += 1) {
      expect(whenValues[index]).toBeGreaterThanOrEqual(whenValues[index - 1]!);
    }
  });

  it("deduplicates daily_checklists before enforcing user/date uniqueness", () => {
    const content = readFileSync(
      join(drizzleDir, "0004_daily_checklist_phase5.sql"),
      "utf8",
    );

    expect(content).toContain('PARTITION BY "user_id", "date"');
    expect(content).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "daily_checklists_user_date_unique"');
  });

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
