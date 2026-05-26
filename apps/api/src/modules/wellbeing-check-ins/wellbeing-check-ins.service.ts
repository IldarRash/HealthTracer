import type {
  AiWellbeingContextSummary,
  UpsertWellbeingCheckInInput,
  WellbeingCheckInAggregatesQuery,
  WellbeingCheckInAggregatesResponse,
  WellbeingCheckInHistoryQuery,
  WellbeingCheckInHistoryResponse,
  WellbeingCheckInResponse,
  WellbeingCheckInUpsertResponse,
} from "@health/types";
import {
  WELLBEING_CHECKIN_STALE_PROPOSAL_DATE_ERROR,
  buildWellbeingCoachingSummary,
  evaluateWellbeingCrisisFlags,
  getTodayIsoDateInTimezone,
  isoDateSchema,
  shiftIsoDate,
} from "@health/types";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { UsersService } from "../users/users.service.js";
import { WellbeingAiContextService } from "./wellbeing-ai-context.service.js";
import { toWellbeingCheckInRecord } from "./wellbeing-check-ins.mapper.js";
import { WellbeingCheckInsRepository } from "./wellbeing-check-ins.repository.js";

@Injectable()
export class WellbeingCheckInsService {
  constructor(
    private readonly wellbeingCheckInsRepository: WellbeingCheckInsRepository,
    private readonly wellbeingAiContextService: WellbeingAiContextService,
    private readonly usersService: UsersService,
  ) {}

  async getCheckInForToday(auth: ClerkAuthContext): Promise<WellbeingCheckInResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const date = getTodayIsoDateInTimezone(user.timezone);

    return this.getCheckInForDate(auth, date);
  }

  async getCheckInForDate(
    auth: ClerkAuthContext,
    date: string,
  ): Promise<WellbeingCheckInResponse> {
    const parsedDate = parseCheckInDate(date);
    const user = await this.usersService.resolveFromAuth(auth);
    const row = await this.wellbeingCheckInsRepository.findByUserAndDate(user.id, parsedDate);

    return {
      checkIn: row ? toWellbeingCheckInRecord(row) : null,
    };
  }

  async upsertCheckInForToday(
    auth: ClerkAuthContext,
    input: UpsertWellbeingCheckInInput,
  ): Promise<WellbeingCheckInUpsertResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const date = getTodayIsoDateInTimezone(user.timezone);

    return this.upsertCheckInForDate(auth, date, input);
  }

  async upsertCheckInForDate(
    auth: ClerkAuthContext,
    date: string,
    input: UpsertWellbeingCheckInInput,
  ): Promise<WellbeingCheckInUpsertResponse> {
    const parsedDate = parseCheckInDate(date);
    const user = await this.usersService.resolveFromAuth(auth);
    const crisisSupport = evaluateWellbeingCrisisFlags({
      moodScore: input.moodScore,
      note: input.note,
    });
    const row = await this.wellbeingCheckInsRepository.upsertByUserAndDate(
      user.id,
      parsedDate,
      input,
      crisisSupport.reasons,
    );

    return {
      checkIn: toWellbeingCheckInRecord(row),
      crisisSupport,
    };
  }

  async createCheckInForDateIfAbsent(
    auth: ClerkAuthContext,
    date: string,
    input: UpsertWellbeingCheckInInput,
    options?: { expectedExistingCheckInId?: string | null },
  ): Promise<WellbeingCheckInUpsertResponse> {
    const parsedDate = parseCheckInDate(date);
    const user = await this.usersService.resolveFromAuth(auth);
    const crisisSupport = evaluateWellbeingCrisisFlags({
      moodScore: input.moodScore,
      note: input.note,
    });
    const { row, created } = await this.wellbeingCheckInsRepository.insertByUserAndDateIfAbsent(
      user.id,
      parsedDate,
      input,
      crisisSupport.reasons,
    );

    if (!created) {
      const expectedExistingCheckInId = options?.expectedExistingCheckInId ?? null;

      if (!expectedExistingCheckInId || row.id !== expectedExistingCheckInId) {
        throw new BadRequestException(WELLBEING_CHECKIN_STALE_PROPOSAL_DATE_ERROR);
      }
    }

    return {
      checkIn: toWellbeingCheckInRecord(row),
      crisisSupport,
    };
  }

  async getHistory(
    auth: ClerkAuthContext,
    query: WellbeingCheckInHistoryQuery,
  ): Promise<WellbeingCheckInHistoryResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const rows = await this.wellbeingCheckInsRepository.listRecentByUserId(user.id, query.limit);

    return {
      entries: rows.map((row) => {
        const checkIn = toWellbeingCheckInRecord(row);

        return {
          date: checkIn.date,
          moodScore: checkIn.moodScore,
          stressScore: checkIn.stressScore,
          tags: checkIn.tags,
          crisisFlagReasons: checkIn.crisisFlagReasons,
          updatedAt: checkIn.updatedAt,
        };
      }),
    };
  }

  async getAggregates(
    auth: ClerkAuthContext,
    query: WellbeingCheckInAggregatesQuery,
  ): Promise<WellbeingCheckInAggregatesResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const anchorDate = getTodayIsoDateInTimezone(user.timezone);
    const startDate = shiftIsoDate(anchorDate, -(query.limit - 1));
    const rows = await this.wellbeingCheckInsRepository.listByUserAndDateRange(
      user.id,
      startDate,
      anchorDate,
    );
    const checkIns = rows.map((row) => toWellbeingCheckInRecord(row));
    const summary = buildWellbeingCoachingSummary({
      checkIns: checkIns.map((checkIn) => ({
        date: checkIn.date,
        moodScore: checkIn.moodScore,
        stressScore: checkIn.stressScore,
      })),
      anchorDate,
    });

    return {
      periodType: query.periodType,
      aggregates: [...checkIns]
        .sort((left, right) => left.date.localeCompare(right.date))
        .map((checkIn) => ({
          date: checkIn.date,
          moodScore: checkIn.moodScore,
          stressScore: checkIn.stressScore,
        })),
      summary: {
        windowDays: summary.windowDays,
        checkInCount: summary.checkInCount,
        moodAverage: summary.moodAverage,
        stressAverage: summary.stressAverage,
        moodTrendDirection: summary.moodTrendDirection,
        stressTrendDirection: summary.stressTrendDirection,
        currentStreak: summary.currentStreak,
        dataSufficiency: summary.dataSufficiency,
      },
    };
  }

  async buildCoachingSummaryForUser(
    userId: string,
    timezone: string,
  ): Promise<AiWellbeingContextSummary> {
    return this.wellbeingAiContextService.buildSummaryForUser(userId, timezone);
  }
}

function parseCheckInDate(date: string): string {
  const parsed = isoDateSchema.safeParse(date);

  if (!parsed.success) {
    throw new BadRequestException("Expected date in YYYY-MM-DD format.");
  }

  return parsed.data;
}
