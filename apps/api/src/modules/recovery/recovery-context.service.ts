import type {
  RecoveryContextResponse,
  RecoveryWeeklyContextResponse,
  UpsertRecoveryCheckInInput,
} from "@health/types";
import {
  aggregateRecoveryProgress,
  buildRecoveryWeeklyEntries,
  computeRecoveryBand,
  getTodayIsoDateInTimezone,
  getWeekStartIsoDate,
  isWellnessSafeRecoveryMessage,
  isoDateSchema,
  shiftIsoDate,
} from "@health/types";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { UsersService } from "../users/users.service.js";
import { RecoveryCheckInsRepository } from "./recovery-check-ins.repository.js";
import { RecoveryContextRepository } from "./recovery-context.repository.js";
import { RecoverySignalCollectorService } from "./recovery-signal-collector.service.js";
import { toRecoveryCheckInRecord, toRecoveryContextSnapshot } from "./recovery.mapper.js";

@Injectable()
export class RecoveryContextService {
  constructor(
    private readonly recoveryCheckInsRepository: RecoveryCheckInsRepository,
    private readonly recoveryContextRepository: RecoveryContextRepository,
    private readonly recoverySignalCollectorService: RecoverySignalCollectorService,
    private readonly usersService: UsersService,
  ) {}

  async getContextForDate(auth: ClerkAuthContext, date?: string): Promise<RecoveryContextResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const targetDate = date ? parseRecoveryDate(date) : getTodayIsoDateInTimezone(user.timezone);
    const context = await this.computeAndPersistSnapshot(user.id, targetDate);
    const checkInRow = await this.recoveryCheckInsRepository.findByUserAndDate(
      user.id,
      targetDate,
    );

    return {
      context,
      checkIn: checkInRow ? toRecoveryCheckInRecord(checkInRow) : null,
    };
  }

  async getWeeklyContext(
    auth: ClerkAuthContext,
    weekStart?: string,
  ): Promise<RecoveryWeeklyContextResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const anchorDate = getTodayIsoDateInTimezone(user.timezone);
    const resolvedWeekStart = weekStart
      ? parseRecoveryDate(weekStart)
      : getWeekStartIsoDate(anchorDate);
    const weekEnd = shiftIsoDate(resolvedWeekStart, 6);

    const snapshots = await Promise.all(
      Array.from({ length: 7 }, (_, offset) =>
        this.computeAndPersistSnapshot(user.id, shiftIsoDate(resolvedWeekStart, offset)),
      ),
    );

    const entries = buildRecoveryWeeklyEntries(snapshots, resolvedWeekStart);
    const checkInCount = await this.recoveryCheckInsRepository.countByUserAndDateRange(
      user.id,
      resolvedWeekStart,
      weekEnd,
    );

    return {
      weekStart: resolvedWeekStart,
      weekEnd,
      entries,
      summary: aggregateRecoveryProgress(entries, checkInCount),
    };
  }

  async upsertCheckIn(
    auth: ClerkAuthContext,
    input: UpsertRecoveryCheckInInput,
  ) {
    const user = await this.usersService.resolveFromAuth(auth);
    const targetDate = input.date
      ? parseRecoveryDate(input.date)
      : getTodayIsoDateInTimezone(user.timezone);
    const checkInRow = await this.recoveryCheckInsRepository.upsertByUserAndDate(
      user.id,
      targetDate,
      input,
    );
    const context = await this.computeAndPersistSnapshot(user.id, targetDate);

    return {
      checkIn: toRecoveryCheckInRecord(checkInRow),
      context,
    };
  }

  async computeAndPersistSnapshot(userId: string, date: string) {
    const signals = await this.recoverySignalCollectorService.collectSignalsForDate(userId, date);
    const payload = computeRecoveryBand({ signals });

    if (!isWellnessSafeRecoveryMessage(payload.focusMessage)) {
      throw new Error("Generated recovery focus message failed wellness safety checks.");
    }

    for (const signal of payload.signals) {
      if (signal.detail && !isWellnessSafeRecoveryMessage(signal.detail)) {
        throw new Error("Generated recovery signal detail failed wellness safety checks.");
      }
    }

    const row = await this.recoveryContextRepository.upsertByUserAndDate(
      userId,
      date,
      payload.band,
      payload,
    );

    return toRecoveryContextSnapshot(row);
  }

  async buildWeeklyRecoveryAggregate(userId: string, weekStart: string, weekEnd: string) {
    const snapshots = await Promise.all(
      Array.from({ length: 7 }, (_, offset) =>
        this.computeAndPersistSnapshot(userId, shiftIsoDate(weekStart, offset)),
      ),
    );
    const entries = buildRecoveryWeeklyEntries(snapshots, weekStart);
    const checkInCount = await this.recoveryCheckInsRepository.countByUserAndDateRange(
      userId,
      weekStart,
      weekEnd,
    );

    return aggregateRecoveryProgress(entries, checkInCount);
  }
}

function parseRecoveryDate(date: string): string {
  const parsed = isoDateSchema.safeParse(date);

  if (!parsed.success) {
    throw new BadRequestException("Expected date in YYYY-MM-DD format.");
  }

  return parsed.data;
}
