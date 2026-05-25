import type { AiRecoveryContextSummary } from "@health/types";
import {
  getTodayIsoDateInTimezone,
  getWeekStartIsoDate,
  shiftIsoDate,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { RecoveryContextService } from "./recovery-context.service.js";

@Injectable()
export class RecoveryAiContextService {
  constructor(private readonly recoveryContextService: RecoveryContextService) {}

  async buildSummaryForUser(
    userId: string,
    timezone: string,
  ): Promise<AiRecoveryContextSummary> {
    const anchorDate = getTodayIsoDateInTimezone(timezone);
    const weekStart = getWeekStartIsoDate(anchorDate);
    const weekEnd = shiftIsoDate(weekStart, 6);

    const snapshot = await this.recoveryContextService.computeAndPersistSnapshot(
      userId,
      anchorDate,
    );
    const weeklySummary = await this.recoveryContextService.buildWeeklyRecoveryAggregate(
      userId,
      weekStart,
      weekEnd,
    );

    return {
      band: snapshot.band,
      dataSufficiency: snapshot.payload.dataSufficiency,
      focusMessage: snapshot.payload.focusMessage,
      signals: snapshot.payload.signals.slice(0, 6),
      date: snapshot.date,
      weeklySummary:
        weeklySummary.daysWithContext > 0 || weeklySummary.checkInCount > 0
          ? weeklySummary
          : undefined,
    };
  }
}
