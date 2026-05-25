import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositorySource = readFileSync(
  join(import.meta.dirname, "goals.repository.ts"),
  "utf8",
);

describe("GoalsRepository weekly focus persistence", () => {
  it("serializes active weekly capacity checks inside a transaction", () => {
    const createIndex = repositorySource.indexOf("async create(");
    const updateIndex = repositorySource.indexOf("async update(");

    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(updateIndex).toBeGreaterThan(createIndex);
    expect(repositorySource).toContain("return this.db.transaction");
    expect(repositorySource).toContain("assertActiveWeeklyCapacity");
  });

  it("uses a transaction-scoped advisory lock keyed by user before weekly cap checks", () => {
    const lockIndex = repositorySource.indexOf("acquireActiveWeeklyGoalLock");
    const lockCallIndex = repositorySource.indexOf("pg_advisory_xact_lock");
    const assertIndex = repositorySource.indexOf("assertActiveWeeklyCapacity");

    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(lockCallIndex).toBeGreaterThan(lockIndex);
    expect(assertIndex).toBeGreaterThan(lockCallIndex);
    expect(repositorySource).toContain("hashtext(${userId}::text)");
    expect(repositorySource).toContain("GOAL_HIERARCHY_WEEKLY_LOCK_NAMESPACE");
  });
});
