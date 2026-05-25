import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as schema from "@health/db";
import { healthMetricSnapshots } from "@health/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

const repositorySource = readFileSync(
  join(import.meta.dirname, "health-metrics.repository.ts"),
  "utf8",
);

const databaseUrl = process.env.DATABASE_URL;

describe("HealthMetricsRepository", () => {
  it("serializes coalesce overlap lower bound for postgres-js", () => {
    const body = repositorySource.slice(
      repositorySource.indexOf("async listSnapshotsForPeriod"),
      repositorySource.indexOf("async listAggregates"),
    );

    expect(body).toContain("periodStartBound = periodStart.toISOString()");
    expect(body).toContain("periodStartBound");
    expect(body).toContain("lte(healthMetricSnapshots.observedAt, periodEnd)");
  });

  it("stores aggregate period columns as UTC date keys", () => {
    const body = repositorySource.slice(
      repositorySource.indexOf("async upsertAggregate"),
      repositorySource.indexOf("async listActiveConsentAggregates"),
    );

    expect(body).toContain("periodStart: string");
    expect(body).toContain("periodEnd: string");
    expect(body).toContain("periodStart: input.periodStart");
    expect(body).toContain("periodEnd: input.periodEnd");
  });
});

describe.runIf(Boolean(databaseUrl))("HealthMetricsRepository postgres date bounds", () => {
  it("coalesce overlap query accepts ISO lower bound with Date upper bound", async () => {
    const client = postgres(databaseUrl!, { prepare: false });
    const db = drizzle(client, { schema });
    const periodStart = new Date("2026-05-25T00:00:00.000Z");
    const periodEnd = new Date("2026-05-25T23:59:59.999Z");

    await expect(
      db
        .select()
        .from(healthMetricSnapshots)
        .where(
          and(
            eq(healthMetricSnapshots.metricType, "sleep"),
            lte(healthMetricSnapshots.observedAt, periodEnd),
            gte(
              sql`coalesce(${healthMetricSnapshots.observedEndAt}, ${healthMetricSnapshots.observedAt})`,
              periodStart.toISOString(),
            ),
          ),
        )
        .limit(1),
    ).resolves.toEqual(expect.any(Array));

    await client.end();
  });
});
