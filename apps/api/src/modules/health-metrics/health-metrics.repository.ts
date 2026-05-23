import { healthMetricAggregates, healthMetricSnapshots } from "@health/db";
import type {
  AggregatePeriodType,
  DeviceProvider,
  HealthMetricType,
  ListHealthMetricAggregatesQuery,
  ListHealthMetricSnapshotsQuery,
  ProviderMetricRecord,
} from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";
import { buildMetricDedupeKey } from "./metric-dedupe.js";

@Injectable()
export class HealthMetricsRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async insertSnapshotIfNew(input: {
    userId: string;
    consentId: string;
    deviceConnectionId: string;
    provider: DeviceProvider;
    record: ProviderMetricRecord;
  }) {
    const dedupeKey = buildMetricDedupeKey(input.provider, input.record);

    const [snapshot] = await this.db
      .insert(healthMetricSnapshots)
      .values({
        userId: input.userId,
        consentId: input.consentId,
        deviceConnectionId: input.deviceConnectionId,
        metricType: input.record.metricType,
        provider: input.provider,
        sourceId: input.record.sourceId ?? null,
        dedupeKey,
        observedAt: new Date(input.record.observedAt),
        observedEndAt: input.record.observedEndAt
          ? new Date(input.record.observedEndAt)
          : null,
        unit: input.record.unit,
        normalizedPayload: input.record.normalizedPayload,
        sourceDeviceLabel: input.record.sourceDeviceLabel ?? null,
      })
      .onConflictDoNothing({
        target: [healthMetricSnapshots.userId, healthMetricSnapshots.dedupeKey],
      })
      .returning();

    return snapshot ?? null;
  }

  async listSnapshots(userId: string, query: ListHealthMetricSnapshotsQuery) {
    const conditions = [eq(healthMetricSnapshots.userId, userId)];

    if (query.metricType) {
      conditions.push(eq(healthMetricSnapshots.metricType, query.metricType));
    }

    return this.db
      .select()
      .from(healthMetricSnapshots)
      .where(and(...conditions))
      .orderBy(desc(healthMetricSnapshots.observedAt))
      .limit(query.limit);
  }

  async listSnapshotsForPeriod(
    userId: string,
    metricType: HealthMetricType,
    consentId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    return this.db
      .select()
      .from(healthMetricSnapshots)
      .where(
        and(
          eq(healthMetricSnapshots.userId, userId),
          eq(healthMetricSnapshots.consentId, consentId),
          eq(healthMetricSnapshots.metricType, metricType),
          lte(healthMetricSnapshots.observedAt, periodEnd),
          gte(
            sql`coalesce(${healthMetricSnapshots.observedEndAt}, ${healthMetricSnapshots.observedAt})`,
            periodStart,
          ),
        ),
      )
      .orderBy(desc(healthMetricSnapshots.observedAt));
  }

  async listAggregates(userId: string, query: ListHealthMetricAggregatesQuery) {
    const conditions = [eq(healthMetricAggregates.userId, userId)];

    if (query.metricType) {
      conditions.push(eq(healthMetricAggregates.metricType, query.metricType));
    }

    if (query.periodType) {
      conditions.push(eq(healthMetricAggregates.periodType, query.periodType));
    }

    return this.db
      .select()
      .from(healthMetricAggregates)
      .where(and(...conditions))
      .orderBy(desc(healthMetricAggregates.periodStart))
      .limit(query.limit);
  }

  async upsertAggregate(input: {
    userId: string;
    consentId: string;
    metricType: HealthMetricType;
    periodType: AggregatePeriodType;
    periodStart: string;
    periodEnd: string;
    aggregatePayload: Record<string, unknown>;
    sourceMetricTypes: HealthMetricType[];
  }) {
    const now = new Date();
    const [aggregate] = await this.db
      .insert(healthMetricAggregates)
      .values({
        userId: input.userId,
        consentId: input.consentId,
        metricType: input.metricType,
        periodType: input.periodType,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        aggregatePayload: input.aggregatePayload,
        sourceMetricTypes: input.sourceMetricTypes,
        calculatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          healthMetricAggregates.userId,
          healthMetricAggregates.metricType,
          healthMetricAggregates.periodType,
          healthMetricAggregates.periodStart,
        ],
        set: {
          consentId: input.consentId,
          periodEnd: input.periodEnd,
          aggregatePayload: input.aggregatePayload,
          sourceMetricTypes: input.sourceMetricTypes,
          calculatedAt: now,
          updatedAt: now,
        },
      })
      .returning();

    if (!aggregate) {
      throw new Error("Failed to upsert health metric aggregate.");
    }

    return aggregate;
  }

  async listActiveConsentAggregates(userId: string, consentIds: string[]) {
    if (consentIds.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(healthMetricAggregates)
      .where(
        and(
          eq(healthMetricAggregates.userId, userId),
          inArray(healthMetricAggregates.consentId, consentIds),
        ),
      )
      .orderBy(desc(healthMetricAggregates.calculatedAt))
      .limit(20);
  }

  async listRecentActiveConsentSnapshots(userId: string, consentIds: string[], limit = 10) {
    if (consentIds.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(healthMetricSnapshots)
      .where(
        and(
          eq(healthMetricSnapshots.userId, userId),
          inArray(healthMetricSnapshots.consentId, consentIds),
        ),
      )
      .orderBy(desc(healthMetricSnapshots.observedAt))
      .limit(limit);
  }
}
