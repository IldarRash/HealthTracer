import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const checkInsRepositorySource = readFileSync(
  join(import.meta.dirname, "recovery-check-ins.repository.ts"),
  "utf8",
);
const contextRepositorySource = readFileSync(
  join(import.meta.dirname, "recovery-context.repository.ts"),
  "utf8",
);
const recoverySchemaSource = readFileSync(
  join(import.meta.dirname, "../../../../../packages/db/src/schema/recovery.ts"),
  "utf8",
);

describe("Recovery repositories", () => {
  it("upserts manual check-ins by unique user and date", () => {
    const upsertBody = checkInsRepositorySource.slice(
      checkInsRepositorySource.indexOf("async upsertByUserAndDate"),
      checkInsRepositorySource.indexOf("async listByUserAndDateRange"),
    );

    expect(upsertBody).toContain("target: [recoveryCheckIns.userId, recoveryCheckIns.date]");
    expect(upsertBody).toContain("updatedAt: new Date()");
    expect(recoverySchemaSource).toContain("recovery_check_ins_user_date_unique");
    expect(recoverySchemaSource).toContain("table.userId");
    expect(recoverySchemaSource).toContain("table.date");
  });

  it("upserts context snapshots by unique user and date and refreshes calculatedAt", () => {
    const upsertBody = contextRepositorySource.slice(
      contextRepositorySource.indexOf("async upsertByUserAndDate"),
      contextRepositorySource.indexOf("async listByUserAndDateRange"),
    );

    expect(upsertBody).toContain(
      "target: [recoveryContextSnapshots.userId, recoveryContextSnapshots.date]",
    );
    expect(upsertBody).toContain("calculatedAt");
    expect(upsertBody).toContain("updatedAt: new Date()");
    expect(recoverySchemaSource).toContain("recovery_context_snapshots_user_date_unique");
  });
});
