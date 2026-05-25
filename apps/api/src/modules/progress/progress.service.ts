import type {
  GenerateWeeklyProgressSummaryInput,
  WeeklyProgressSummaryResponse,
} from "@health/types";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { UsersService } from "../users/users.service.js";
import { RecoveryContextService } from "../recovery/recovery-context.service.js";
import { WorkoutsRepository } from "../workouts/workouts.repository.js";
import { toWorkoutSession } from "../workouts/workout.mapper.js";
import {
  aggregateWorkoutSessions,
  buildDeferredDomains,
  buildSummaryUserMessage,
  detectWorkoutTrends,
  isWellnessSafeProgressMessage,
  resolvePriorWeekRange,
  resolveProgressDataStatus,
  resolveWeekRange,
} from "./progress-aggregate.service.js";
import { toTrendObservation, toWeeklyProgressSummary } from "./progress.mapper.js";
import { ProgressRepository } from "./progress.repository.js";

@Injectable()
export class ProgressService {
  constructor(
    private readonly progressRepository: ProgressRepository,
    private readonly workoutsRepository: WorkoutsRepository,
    private readonly recoveryContextService: RecoveryContextService,
    private readonly usersService: UsersService,
  ) {}

  async getLatestSummary(auth: ClerkAuthContext): Promise<WeeklyProgressSummaryResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const summaryRow = await this.progressRepository.findLatestByUserId(user.id);

    if (!summaryRow) {
      throw new NotFoundException("Weekly progress summary not found.");
    }

    const trends = await this.progressRepository.listTrendsBySummaryId(summaryRow.id);

    return {
      summary: toWeeklyProgressSummary(summaryRow),
      trends: trends.map(toTrendObservation),
    };
  }

  async getCurrentWeekSummary(auth: ClerkAuthContext): Promise<WeeklyProgressSummaryResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const { weekStart } = resolveWeekRange(new Date(), undefined);
    const summaryRow = await this.progressRepository.findActiveByUserIdAndWeekStart(
      user.id,
      weekStart,
    );

    if (!summaryRow) {
      throw new NotFoundException("Weekly progress summary not found for the current week.");
    }

    const trends = await this.progressRepository.listTrendsBySummaryId(summaryRow.id);

    return {
      summary: toWeeklyProgressSummary(summaryRow),
      trends: trends.map(toTrendObservation),
    };
  }

  async generateWeeklySummary(
    auth: ClerkAuthContext,
    input: GenerateWeeklyProgressSummaryInput,
  ): Promise<WeeklyProgressSummaryResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const weekRange = resolveWeekRange(new Date(), input.weekStart);
    const priorWeekRange = resolvePriorWeekRange(weekRange.weekStart);

    const existingSummary = await this.progressRepository.findActiveByUserIdAndWeekStart(
      user.id,
      weekRange.weekStart,
    );

    if (existingSummary && !input.refresh) {
      const trends = await this.progressRepository.listTrendsBySummaryId(existingSummary.id);

      return {
        summary: toWeeklyProgressSummary(existingSummary),
        trends: trends.map(toTrendObservation),
      };
    }

    const sessionRows = await this.workoutsRepository.listSessionsByUserIdInDateRange(
      user.id,
      priorWeekRange.weekStart,
      weekRange.weekEnd,
    );
    const sessions = sessionRows.map(toWorkoutSession);

    const currentWorkoutAggregate = aggregateWorkoutSessions(
      sessions,
      weekRange.weekStart,
      weekRange.weekEnd,
    );
    const priorWorkoutAggregate = aggregateWorkoutSessions(
      sessions,
      priorWeekRange.weekStart,
      priorWeekRange.weekEnd,
    );
    const recoveryAggregate = await this.recoveryContextService.buildWeeklyRecoveryAggregate(
      user.id,
      weekRange.weekStart,
      weekRange.weekEnd,
    );

    const sourceAggregates = {
      workout: currentWorkoutAggregate.plannedCount > 0 ? currentWorkoutAggregate : null,
      recovery:
        recoveryAggregate.daysWithContext > 0 || recoveryAggregate.checkInCount > 0
          ? recoveryAggregate
          : null,
    };
    const deferredDomains = buildDeferredDomains(sourceAggregates.recovery);
    const dataStatus = resolveProgressDataStatus(sourceAggregates);
    const userMessage = buildSummaryUserMessage(sourceAggregates, dataStatus);
    const trendDrafts = detectWorkoutTrends(
      currentWorkoutAggregate,
      priorWorkoutAggregate.plannedCount > 0 ? priorWorkoutAggregate : null,
      weekRange.weekStart,
      weekRange.weekEnd,
    );

    for (const trend of trendDrafts) {
      if (!isWellnessSafeProgressMessage(trend.message)) {
        throw new Error("Generated trend message failed wellness safety checks.");
      }
    }

    if (!isWellnessSafeProgressMessage(userMessage)) {
      throw new Error("Generated summary message failed wellness safety checks.");
    }

    const created = await this.progressRepository.createSummaryWithTrends({
      userId: user.id,
      weekStart: weekRange.weekStart,
      weekEnd: weekRange.weekEnd,
      dataStatus,
      sourceAggregates,
      deferredDomains,
      userMessage,
      trendDrafts,
      supersedeSummaryId: existingSummary?.id,
    });

    return {
      summary: toWeeklyProgressSummary(created.summary),
      trends: created.trends.map(toTrendObservation),
    };
  }

  async getLatestSummarySnapshot(userId: string): Promise<WeeklyProgressSummaryResponse | null> {
    const summaryRow = await this.progressRepository.findLatestByUserId(userId);

    if (!summaryRow) {
      return null;
    }

    const trends = await this.progressRepository.listTrendsBySummaryId(summaryRow.id);

    return {
      summary: toWeeklyProgressSummary(summaryRow),
      trends: trends.map(toTrendObservation),
    };
  }
}
