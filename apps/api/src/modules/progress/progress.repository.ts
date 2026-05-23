import { trendObservations, weeklyProgressSummaries } from "@health/db";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";
import type { TrendDraft } from "./progress-aggregate.service.js";
import {
  toSummaryInsertValues,
  toTrendInsertValues,
  toTrendObservation,
  toWeeklyProgressSummary,
} from "./progress.mapper.js";
import type {
  DeferredProgressDomain,
  ProgressSourceAggregates,
  WeeklyProgressSummary,
} from "@health/types";

@Injectable()
export class ProgressRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async findLatestByUserId(userId: string) {
    const [row] = await this.db
      .select()
      .from(weeklyProgressSummaries)
      .where(
        and(
          eq(weeklyProgressSummaries.userId, userId),
          isNull(weeklyProgressSummaries.supersededById),
        ),
      )
      .orderBy(desc(weeklyProgressSummaries.generatedAt))
      .limit(1);

    return row ?? null;
  }

  async findActiveByUserIdAndWeekStart(userId: string, weekStart: string) {
    const [row] = await this.db
      .select()
      .from(weeklyProgressSummaries)
      .where(
        and(
          eq(weeklyProgressSummaries.userId, userId),
          eq(weeklyProgressSummaries.weekStart, weekStart),
          isNull(weeklyProgressSummaries.supersededById),
        ),
      )
      .orderBy(desc(weeklyProgressSummaries.generatedAt))
      .limit(1);

    return row ?? null;
  }

  async listTrendsBySummaryId(summaryId: string) {
    return this.db
      .select()
      .from(trendObservations)
      .where(eq(trendObservations.summaryId, summaryId))
      .orderBy(trendObservations.createdAt);
  }

  async createSummaryWithTrends(input: {
    userId: string;
    weekStart: string;
    weekEnd: string;
    dataStatus: WeeklyProgressSummary["dataStatus"];
    sourceAggregates: ProgressSourceAggregates;
    deferredDomains: DeferredProgressDomain[];
    userMessage: string;
    trendDrafts: TrendDraft[];
    supersedeSummaryId?: string;
  }) {
    return this.db.transaction(async (tx) => {
      const [summary] = await tx
        .insert(weeklyProgressSummaries)
        .values(
          toSummaryInsertValues(
            input.userId,
            input.weekStart,
            input.weekEnd,
            input.dataStatus,
            input.sourceAggregates,
            input.deferredDomains,
            input.userMessage,
          ),
        )
        .returning();

      if (!summary) {
        throw new Error("Failed to create weekly progress summary.");
      }

      if (input.supersedeSummaryId) {
        await tx
          .update(weeklyProgressSummaries)
          .set({ supersededById: summary.id })
          .where(eq(weeklyProgressSummaries.id, input.supersedeSummaryId));
      }

      const trendRows =
        input.trendDrafts.length > 0
          ? await tx
              .insert(trendObservations)
              .values(
                input.trendDrafts.map((draft) =>
                  toTrendInsertValues(
                    input.userId,
                    summary.id,
                    input.weekStart,
                    input.weekEnd,
                    draft,
                  ),
                ),
              )
              .returning()
          : [];

      return {
        summary,
        trends: trendRows,
      };
    });
  }

  async summaryExistsForUser(userId: string, summaryId: string) {
    const [row] = await this.db
      .select({ id: weeklyProgressSummaries.id })
      .from(weeklyProgressSummaries)
      .where(
        and(
          eq(weeklyProgressSummaries.id, summaryId),
          eq(weeklyProgressSummaries.userId, userId),
        ),
      )
      .limit(1);

    return !!row;
  }

  async findTrendsOwnedByUser(userId: string, trendIds: readonly string[]) {
    if (trendIds.length === 0) {
      return [];
    }

    return this.db
      .select({
        id: trendObservations.id,
        summaryId: trendObservations.summaryId,
      })
      .from(trendObservations)
      .where(
        and(
          eq(trendObservations.userId, userId),
          inArray(trendObservations.id, [...trendIds]),
        ),
      );
  }

  async getSummaryResponseById(userId: string, summaryId: string) {
    const [summary] = await this.db
      .select()
      .from(weeklyProgressSummaries)
      .where(
        and(
          eq(weeklyProgressSummaries.id, summaryId),
          eq(weeklyProgressSummaries.userId, userId),
        ),
      )
      .limit(1);

    if (!summary) {
      return null;
    }

    const trends = await this.listTrendsBySummaryId(summary.id);

    return {
      summary: toWeeklyProgressSummary(summary),
      trends: trends.map(toTrendObservation),
    };
  }
}
