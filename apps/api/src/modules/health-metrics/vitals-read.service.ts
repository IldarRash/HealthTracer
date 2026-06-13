import type {
  HeartRateSnapshotPayload,
  PulseOverviewResponse,
  RecoveryInputSnapshotPayload,
  SleepNightSummary,
  SleepOverviewResponse,
  SleepSnapshotPayload,
  WorkoutHeartRateDetail,
} from "@health/types";
import { Injectable, NotFoundException } from "@nestjs/common";
import { HealthMetricsRepository } from "./health-metrics.repository.js";
import { UsersService } from "../users/users.service.js";
import type { ClerkAuthContext } from "../../auth.types.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class VitalsReadService {
  constructor(
    private readonly healthMetricsRepository: HealthMetricsRepository,
    private readonly usersService: UsersService,
  ) {}

  async getSleepOverview(auth: ClerkAuthContext): Promise<SleepOverviewResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const now = new Date();
    const fromDate = new Date(now.getTime() - THIRTY_DAYS_MS);

    const rows = await this.healthMetricsRepository.listSleepSnapshotsForRange(
      user.id,
      fromDate,
      now,
      90,
    );

    // Build nightly summaries (one per calendar date — pick the longest session if multiple)
    const byDate = new Map<string, SleepNightSummary>();

    for (const row of rows) {
      const payload = row.normalizedPayload as unknown as SleepSnapshotPayload;
      const dateKey = row.observedAt.toISOString().slice(0, 10);
      const existing = byDate.get(dateKey);

      if (!existing || payload.durationMinutes > existing.durationMinutes) {
        byDate.set(dateKey, {
          date: dateKey,
          durationMinutes: payload.durationMinutes,
          windowStart: payload.intervalStart ?? null,
          windowEnd: payload.intervalEnd ?? null,
          stageSummary: payload.stageSummary
            ? {
                awakeMinutes: payload.stageSummary.awakeMinutes ?? null,
                remMinutes: payload.stageSummary.remMinutes ?? null,
                lightMinutes: payload.stageSummary.lightMinutes ?? null,
                deepMinutes: payload.stageSummary.deepMinutes ?? null,
              }
            : null,
        });
      }
    }

    // Sort nights newest-first
    const allNights = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));

    const lastNight = allNights[0] ?? null;

    // Trend: last 30 days, oldest-first for chart
    const trend = allNights
      .slice(0, 30)
      .reverse()
      .map((n) => ({ date: n.date, durationMinutes: n.durationMinutes }));

    // 7-day average
    const last7 = allNights.slice(0, 7);
    const sevenDayAverageMinutes =
      last7.length > 0
        ? Math.round(last7.reduce((s, n) => s + n.durationMinutes, 0) / last7.length)
        : null;

    // Recent nights list (last 7 for detail panel)
    const recentNights = allNights.slice(0, 7);

    return {
      lastNight,
      trend,
      sevenDayAverageMinutes,
      recentNights,
    };
  }

  async getPulseOverview(auth: ClerkAuthContext): Promise<PulseOverviewResponse> {
    const user = await this.usersService.resolveFromAuth(auth);

    const [rhrRows, hrvRows, readinessRows, workoutRows] = await Promise.all([
      this.healthMetricsRepository.listRecoveryInputSnapshotsByType(
        user.id,
        "resting_heart_rate",
        30,
      ),
      this.healthMetricsRepository.listRecoveryInputSnapshotsByType(user.id, "hrv_summary", 30),
      this.healthMetricsRepository.listRecoveryInputSnapshotsByType(
        user.id,
        "readiness_score",
        5,
      ),
      this.healthMetricsRepository.listHeartRateSnapshots(user.id, 6),
    ]);

    const toLatest = (rows: typeof rhrRows, unit: string) => {
      if (rows.length === 0) return null;
      const r = rows[0]!;
      const p = r.normalizedPayload as unknown as RecoveryInputSnapshotPayload;
      const raw = typeof p.value === "number" ? p.value : Number(p.value);
      // Guard: non-numeric payload value would produce NaN which fails z.number() → 500.
      if (!Number.isFinite(raw)) return null;
      return {
        value: raw,
        unit: p.unit ?? unit,
        observedAt: r.observedAt.toISOString(),
      };
    };

    // Trend is returned oldest-first (ascending date) to match sleep trend ordering
    // and what charts expect. Repository returns newest-first, so reverse here.
    const toTrend = (rows: typeof rhrRows) =>
      rows
        .map((r) => {
          const p = r.normalizedPayload as unknown as RecoveryInputSnapshotPayload;
          const raw = typeof p.value === "number" ? p.value : Number(p.value);
          return {
            date: r.observedAt.toISOString(),
            value: Number.isFinite(raw) ? raw : null,
          };
        })
        .filter((pt): pt is { date: string; value: number } => pt.value !== null)
        .reverse();

    const readinessLatest = toLatest(readinessRows, "score");

    const recentWorkouts = workoutRows.map((row) => {
      const p = row.normalizedPayload as unknown as HeartRateSnapshotPayload;
      const durationSec = p.samples.length > 0 ? (p.samples.at(-1)?.offsetSec ?? 0) : 0;
      return {
        snapshotId: row.id,
        observedAt: row.observedAt.toISOString(),
        activityType: p.activityType ?? null,
        durationMinutes: Math.round(durationSec / 60),
        avgBpm: p.avgBpm,
        maxBpm: p.maxBpm,
        minBpm: p.minBpm,
        zoneSummary: p.zoneSummary,
      };
    });

    return {
      restingHeartRate: {
        latest: toLatest(rhrRows, "bpm"),
        unit: "bpm",
        trend: toTrend(rhrRows),
      },
      hrv: {
        latest: toLatest(hrvRows, "ms"),
        unit: "ms",
        trend: toTrend(hrvRows),
      },
      readiness: readinessLatest,
      recentWorkouts,
    };
  }

  async getWorkoutHeartRateDetail(
    auth: ClerkAuthContext,
    snapshotId: string,
  ): Promise<WorkoutHeartRateDetail> {
    const user = await this.usersService.resolveFromAuth(auth);

    const row = await this.healthMetricsRepository.findHeartRateSnapshotById(
      user.id,
      snapshotId,
    );

    if (!row) {
      throw new NotFoundException("Heart rate snapshot not found.");
    }

    const p = row.normalizedPayload as unknown as HeartRateSnapshotPayload;
    const durationSec = p.samples.length > 0 ? (p.samples.at(-1)?.offsetSec ?? 0) : 0;

    return {
      snapshotId: row.id,
      observedAt: row.observedAt.toISOString(),
      activityType: p.activityType ?? null,
      durationMinutes: Math.round(durationSec / 60),
      avgBpm: p.avgBpm,
      maxBpm: p.maxBpm,
      minBpm: p.minBpm,
      zoneSummary: p.zoneSummary,
      samples: p.samples,
    };
  }
}
