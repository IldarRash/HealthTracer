import type { AiWellbeingContextSummary } from "@health/types";
import { buildWellbeingCoachingSummary, getTodayIsoDateInTimezone } from "@health/types";
import { Injectable } from "@nestjs/common";
import { toWellbeingCheckInRecord } from "./wellbeing-check-ins.mapper.js";
import { WellbeingCheckInsRepository } from "./wellbeing-check-ins.repository.js";

@Injectable()
export class WellbeingAiContextService {
  constructor(private readonly wellbeingCheckInsRepository: WellbeingCheckInsRepository) {}

  async buildSummaryForUser(
    userId: string,
    timezone: string,
  ): Promise<AiWellbeingContextSummary> {
    const anchorDate = getTodayIsoDateInTimezone(timezone);
    const rows = await this.wellbeingCheckInsRepository.listRecentByUserId(userId, 30);
    const checkIns = rows.map((row) => {
      const record = toWellbeingCheckInRecord(row);

      return {
        date: record.date,
        moodScore: record.moodScore,
        stressScore: record.stressScore,
      };
    });

    return buildWellbeingCoachingSummary({
      checkIns,
      anchorDate,
    });
  }
}
