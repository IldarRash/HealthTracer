import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositorySource = readFileSync(
  join(import.meta.dirname, "onboarding.repository.ts"),
  "utf8",
);

describe("OnboardingRepository persistence boundary", () => {
  it("direct-writes onboarding state inside one database transaction", () => {
    const transactionIndex = repositorySource.indexOf("return this.db.transaction");
    const userUpdateIndex = repositorySource.indexOf(".update(users)");
    const profileUpsertIndex = repositorySource.indexOf(".insert(userProfiles)");
    const goalInsertIndex = repositorySource.indexOf(".insert(goals)");

    expect(transactionIndex).toBeGreaterThanOrEqual(0);
    expect(userUpdateIndex).toBeGreaterThan(transactionIndex);
    expect(profileUpsertIndex).toBeGreaterThan(transactionIndex);
    expect(goalInsertIndex).toBeGreaterThan(transactionIndex);
    expect(repositorySource).toContain("onConflictDoUpdate");
    expect(repositorySource).toContain("existingQuarterlyGoal");
    expect(repositorySource).toContain("DuplicateActiveQuarterlyGoalError");
  });
});
