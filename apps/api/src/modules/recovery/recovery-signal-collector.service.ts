import type { RecoveryBandInputSignal } from "@health/types";
import {
  buildDeviceRecoveryInputSignal,
  buildManualCheckInSignals,
  buildSleepMetricSignal,
  buildTodayFeedbackSignals,
  buildWorkoutFatigueSignal,
  todayDailyFeedbackSchema,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { DeviceConnectionsRepository } from "../device-connections/device-connections.repository.js";
import { isConsentActive } from "../device-connections/device-connection.mapper.js";
import { HealthMetricsRepository } from "../health-metrics/health-metrics.repository.js";
import { TodayRepository } from "../today/today.repository.js";
import { WorkoutsRepository } from "../workouts/workouts.repository.js";
import { toWorkoutSession } from "../workouts/workout.mapper.js";
import { RecoveryCheckInsRepository } from "./recovery-check-ins.repository.js";

@Injectable()
export class RecoverySignalCollectorService {
  constructor(
    private readonly recoveryCheckInsRepository: RecoveryCheckInsRepository,
    private readonly todayRepository: TodayRepository,
    private readonly workoutsRepository: WorkoutsRepository,
    private readonly deviceConnectionsRepository: DeviceConnectionsRepository,
    private readonly healthMetricsRepository: HealthMetricsRepository,
  ) {}

  async collectSignalsForDate(userId: string, date: string): Promise<RecoveryBandInputSignal[]> {
    const [checkIn, checklist, sessionRows, activeConsentIds] = await Promise.all([
      this.recoveryCheckInsRepository.findByUserAndDate(userId, date),
      this.todayRepository.findByUserAndDate(userId, date),
      this.workoutsRepository.listSessionsByUserIdInDateRange(userId, date, date),
      this.resolveActiveAiConsentIds(userId),
    ]);

    const signals: RecoveryBandInputSignal[] = [];

    if (checkIn) {
      signals.push(
        ...buildManualCheckInSignals({
          soreness: checkIn.soreness,
          fatigue: checkIn.fatigue,
          moodScore: checkIn.moodScore,
          perceivedStress: checkIn.perceivedStress,
        }),
      );
    }

    if (checklist?.feedback) {
      const parsedFeedback = todayDailyFeedbackSchema.safeParse(checklist.feedback);

      if (parsedFeedback.success) {
        signals.push(...buildTodayFeedbackSignals(parsedFeedback.data));
      }
    }

    const completedSessions = sessionRows
      .map(toWorkoutSession)
      .filter((session) => session.status === "completed");

    for (const session of completedSessions) {
      if (typeof session.feedback.fatigue === "number") {
        signals.push(buildWorkoutFatigueSignal(session.feedback.fatigue));
      }
    }

    if (activeConsentIds.length > 0) {
      const [sleepAggregates, sleepSnapshots, recoveryAggregates, recoverySnapshots] =
        await Promise.all([
          this.healthMetricsRepository.listActiveConsentAggregatesForDate(
            userId,
            activeConsentIds,
            date,
            ["sleep"],
          ),
          this.healthMetricsRepository.listActiveConsentSnapshotsForDate(
            userId,
            activeConsentIds,
            date,
            ["sleep"],
          ),
          this.healthMetricsRepository.listActiveConsentAggregatesForDate(
            userId,
            activeConsentIds,
            date,
            ["recovery_input"],
          ),
          this.healthMetricsRepository.listActiveConsentSnapshotsForDate(
            userId,
            activeConsentIds,
            date,
            ["recovery_input"],
          ),
        ]);

      const sleepDuration =
        extractSleepDurationMinutes(sleepAggregates[0]?.aggregatePayload) ??
        extractSleepDurationMinutes(sleepSnapshots[0]?.normalizedPayload);

      if (sleepDuration != null) {
        signals.push(buildSleepMetricSignal(sleepDuration));
      }

      const recoveryInputs = [
        ...recoveryAggregates.flatMap((aggregate) =>
          extractRecoveryInputs(aggregate.aggregatePayload),
        ),
        ...recoverySnapshots.map((snapshot) => ({
          inputType: String(
            (snapshot.normalizedPayload as Record<string, unknown>).inputType ?? "recovery_input",
          ),
          value: (snapshot.normalizedPayload as Record<string, unknown>).value,
        })),
      ];

      for (const input of recoveryInputs.slice(0, 3)) {
        if (input.value == null) {
          continue;
        }

        const numericOrStringValue =
          typeof input.value === "number" || typeof input.value === "string"
            ? input.value
            : String(input.value);

        signals.push(buildDeviceRecoveryInputSignal(input.inputType, numericOrStringValue));
      }
    }

    return signals;
  }

  private async resolveActiveAiConsentIds(userId: string): Promise<string[]> {
    const consents = await this.deviceConnectionsRepository.listConsentsByUserId(userId);

    return consents
      .filter((consent) => isConsentActive(consent) && consent.allowAiContext)
      .map((consent) => consent.id);
  }
}

function extractSleepDurationMinutes(payload: Record<string, unknown> | undefined | null) {
  if (!payload) {
    return null;
  }

  if (typeof payload.totalDurationMinutes === "number") {
    return payload.totalDurationMinutes;
  }

  if (typeof payload.durationMinutes === "number") {
    return payload.durationMinutes;
  }

  return null;
}

function extractRecoveryInputs(payload: Record<string, unknown> | undefined | null) {
  if (!payload || !Array.isArray(payload.inputs)) {
    return [] as Array<{ inputType: string; value: unknown }>;
  }

  return payload.inputs
    .filter((input): input is Record<string, unknown> => typeof input === "object" && input != null)
    .map((input) => ({
      inputType: String(input.inputType ?? "recovery_input"),
      value: input.latestValue ?? input.value,
    }));
}
