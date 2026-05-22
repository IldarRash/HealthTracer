import { trendObservations, weeklyProgressSummaries } from "@health/db";
import {
  deferredProgressDomainSchema,
  progressDataStatusSchema,
  progressDomainSchema,
  progressSourceAggregatesSchema,
  trendDataSufficiencySchema,
  trendDirectionSchema,
  trendTypeSchema,
  type DeferredProgressDomain,
  type ProgressSourceAggregates,
  type TrendObservation,
  type WeeklyProgressSummary,
} from "@health/types";
import { InternalServerErrorException } from "@nestjs/common";
import type { TrendDraft } from "./progress-aggregate.service.js";

type WeeklyProgressSummaryRow = typeof weeklyProgressSummaries.$inferSelect;
type TrendObservationRow = typeof trendObservations.$inferSelect;

function parseStoredValue<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  value: unknown,
  field: string,
): T {
  const result = schema.safeParse(value);

  if (!result.success || result.data === undefined) {
    throw new InternalServerErrorException(`Invalid stored progress ${field}.`);
  }

  return result.data;
}

export function toWeeklyProgressSummary(row: WeeklyProgressSummaryRow): WeeklyProgressSummary {
  return {
    id: row.id,
    userId: row.userId,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    generatedAt: row.generatedAt.toISOString(),
    dataStatus: parseStoredValue(progressDataStatusSchema, row.dataStatus, "data status"),
    sourceAggregates: parseStoredValue(
      progressSourceAggregatesSchema,
      row.sourceAggregates,
      "source aggregates",
    ),
    deferredDomains: parseStoredValue(
      deferredProgressDomainSchema.array(),
      row.deferredDomains,
      "deferred domains",
    ) as DeferredProgressDomain[],
    userMessage: row.userMessage,
    supersededById: row.supersededById,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTrendObservation(row: TrendObservationRow): TrendObservation {
  return {
    id: row.id,
    userId: row.userId,
    summaryId: row.summaryId,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    domain: parseStoredValue(progressDomainSchema, row.domain, "trend domain"),
    trendType: parseStoredValue(trendTypeSchema, row.trendType, "trend type"),
    direction: parseStoredValue(trendDirectionSchema, row.direction, "trend direction"),
    dataSufficiency: parseStoredValue(
      trendDataSufficiencySchema,
      row.dataSufficiency,
      "trend data sufficiency",
    ),
    supportingAggregate: row.supportingAggregate,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTrendInsertValues(
  userId: string,
  summaryId: string,
  weekStart: string,
  weekEnd: string,
  draft: TrendDraft,
) {
  return {
    userId,
    summaryId,
    weekStart,
    weekEnd,
    domain: draft.domain,
    trendType: draft.trendType,
    direction: draft.direction,
    dataSufficiency: draft.dataSufficiency,
    supportingAggregate: draft.supportingAggregate,
    message: draft.message,
  };
}

export function toSummaryInsertValues(
  userId: string,
  weekStart: string,
  weekEnd: string,
  dataStatus: WeeklyProgressSummary["dataStatus"],
  sourceAggregates: ProgressSourceAggregates,
  deferredDomains: DeferredProgressDomain[],
  userMessage: string,
) {
  return {
    userId,
    weekStart,
    weekEnd,
    dataStatus,
    sourceAggregates,
    deferredDomains,
    userMessage,
  };
}
