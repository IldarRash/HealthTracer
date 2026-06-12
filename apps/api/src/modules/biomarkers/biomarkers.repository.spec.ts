import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Mirrors documents.repository.spec.ts: source-level assertions on the query
// predicates that carry the module's safety/ownership invariants.
const repositorySource = readFileSync(
  join(import.meta.dirname, "biomarkers.repository.ts"),
  "utf8",
);

function extractMethodBody(methodName: string): string {
  const start = repositorySource.indexOf(`async ${methodName}`);
  const nextMethod = repositorySource.indexOf("\n  async ", start + 1);

  expect(start).toBeGreaterThan(-1);

  return repositorySource.slice(start, nextMethod === -1 ? undefined : nextMethod);
}

const USER_SCOPED_METHODS = [
  "listActiveReportsByUserId",
  "findActiveReportById",
  "updateReportStatus",
  "updateReportConsent",
  "softDeleteReport",
  "createReadingsForReport",
  "listActiveReadingsByUserId",
  "listReadingsByReportId",
  "findActiveReadingById",
  "updateReading",
  "softDeleteReading",
  "listReadingsByMarkerKey",
  "listContextEligibleLatestReadingPerMarker",
  "findContextEligibleReadingById",
  "listLatestReadingPerMarker",
  "countActiveReadingsByMarker",
] as const;

describe("BiomarkersRepository query predicates", () => {
  it("scopes every query and mutation to the owning userId", () => {
    for (const methodName of USER_SCOPED_METHODS) {
      const body = extractMethodBody(methodName);

      expect(body, `${methodName} must filter by userId`).toMatch(
        /eq\((labReports|biomarkerReadings)\.userId, userId\)/,
      );
    }
  });

  it("excludes soft-deleted rows from every query and mutation", () => {
    for (const methodName of USER_SCOPED_METHODS) {
      const body = extractMethodBody(methodName);

      expect(body, `${methodName} must exclude soft-deleted rows`).toMatch(
        /isNull\((labReports|biomarkerReadings)\.deletedAt\)/,
      );
    }
  });

  it("soft-deletes a report and its readings in one transaction (readings first)", () => {
    const body = extractMethodBody("softDeleteReport");

    expect(body).toContain("this.db.transaction(");
    expect(body.indexOf(".update(biomarkerReadings)")).toBeLessThan(
      body.indexOf(".update(labReports)"),
    );
  });

  it("replaces a report's readings transactionally instead of appending", () => {
    const body = extractMethodBody("createReadingsForReport");

    expect(body).toContain("this.db.transaction(");
    // Prior readings are soft-deleted before the new batch is inserted.
    expect(body.indexOf(".update(biomarkerReadings)")).toBeLessThan(
      body.indexOf(".insert(biomarkerReadings)"),
    );
  });

  it("computes the latest reading per marker with DISTINCT ON", () => {
    const body = extractMethodBody("listLatestReadingPerMarker");

    expect(body).toContain("selectDistinctOn([biomarkerReadings.biomarkerKey])");
    expect(body).toContain("desc nulls last");
  });

  it("gates coach-context eligibility on manual source OR active consented lab report", () => {
    const condition = repositorySource.slice(
      repositorySource.indexOf("private contextEligibleCondition()"),
      repositorySource.indexOf("}", repositorySource.indexOf("private contextEligibleCondition()")),
    );

    // Manual readings are always eligible (the user typed them deliberately).
    expect(condition).toContain('eq(biomarkerReadings.source, "manual")');
    // Extracted readings require an active (non-deleted) report with coach-chat consent.
    expect(condition).toContain("isNull(labReports.deletedAt)");
    expect(condition).toContain("isNotNull(labReports.coachContextConsentAt)");
    expect(condition).toMatch(/or\(/);
  });

  it("applies the eligibility condition to both context-eligible queries", () => {
    for (const methodName of [
      "listContextEligibleLatestReadingPerMarker",
      "findContextEligibleReadingById",
    ] as const) {
      const body = extractMethodBody(methodName);

      expect(body, `${methodName} must join lab reports`).toContain(
        ".leftJoin(labReports, eq(biomarkerReadings.labReportId, labReports.id))",
      );
      expect(body, `${methodName} must apply the eligibility condition`).toContain(
        "this.contextEligibleCondition()",
      );
    }
  });

  it("computes the latest context-eligible reading per marker with DISTINCT ON over the filtered set", () => {
    const body = extractMethodBody("listContextEligibleLatestReadingPerMarker");

    expect(body).toContain("selectDistinctOn([biomarkerReadings.biomarkerKey]");
    expect(body).toContain("desc nulls last");
  });

  it("counts dashboard readings grouped by marker key", () => {
    const body = extractMethodBody("countActiveReadingsByMarker");

    expect(body).toContain("count(*)::int");
    expect(body).toContain(".groupBy(biomarkerReadings.biomarkerKey)");
  });
});
