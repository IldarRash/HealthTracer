import { bodyCompositionAnalyses } from "@health/db";
import type {
  BodyCompositionAnalysis,
  SaveBodyAnalysisProposalPayload,
} from "@health/types";
import { BODY_ANALYSIS_DISCLAIMER } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

@Injectable()
export class BodyRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async findLatestAnalysisByUserId(
    userId: string,
  ): Promise<BodyCompositionAnalysis | null> {
    const [row] = await this.db
      .select()
      .from(bodyCompositionAnalyses)
      .where(eq(bodyCompositionAnalyses.userId, userId))
      .orderBy(desc(bodyCompositionAnalyses.createdAt))
      .limit(1);

    return row ? this.mapRow(row) : null;
  }

  async listAnalysesByUserId(
    userId: string,
    limit = 8,
  ): Promise<BodyCompositionAnalysis[]> {
    const rows = await this.db
      .select()
      .from(bodyCompositionAnalyses)
      .where(eq(bodyCompositionAnalyses.userId, userId))
      .orderBy(desc(bodyCompositionAnalyses.createdAt))
      .limit(limit);

    return rows.map((row) => this.mapRow(row));
  }

  async findAnalysisByIdForUser(
    userId: string,
    id: string,
  ): Promise<BodyCompositionAnalysis | null> {
    const [row] = await this.db
      .select()
      .from(bodyCompositionAnalyses)
      .where(
        and(
          eq(bodyCompositionAnalyses.id, id),
          eq(bodyCompositionAnalyses.userId, userId),
        ),
      )
      .limit(1);

    return row ? this.mapRow(row) : null;
  }

  /**
   * Persists a body-composition analysis from an accepted proposal.
   * Numbers only — photos are never stored.
   */
  async createAnalysis(
    userId: string,
    sourceProposalId: string,
    payload: SaveBodyAnalysisProposalPayload,
  ): Promise<BodyCompositionAnalysis> {
    // Build the 8-week fat% trend from existing records.
    const priorAnalyses = await this.listAnalysesByUserId(userId, 7);
    const fatPctTrend = buildFatPctTrend(priorAnalyses, payload);
    const analysisHistory = priorAnalyses.map((a) => a.id);

    const [row] = await this.db
      .insert(bodyCompositionAnalyses)
      .values({
        userId,
        date: payload.date,
        source: payload.source,
        fatPctMin: payload.fatPctMin ?? null,
        fatPctMax: payload.fatPctMax ?? null,
        muscleTone: payload.muscleTone ?? null,
        weightKg: payload.weightKg ?? null,
        weightSelfReported: payload.weightSelfReported ? 1 : 0,
        strongGroups: payload.strongGroups,
        weakGroups: payload.weakGroups,
        muscleMap: payload.muscleMap,
        fatPctTrend,
        analysisHistory,
        sourceProposalId,
        disclaimer: BODY_ANALYSIS_DISCLAIMER,
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create body-composition analysis.");
    }

    return this.mapRow(row);
  }

  private mapRow(
    row: typeof bodyCompositionAnalyses.$inferSelect,
  ): BodyCompositionAnalysis {
    return {
      id: row.id,
      userId: row.userId,
      date: row.date,
      source: row.source,
      fatPctMin: row.fatPctMin ?? null,
      fatPctMax: row.fatPctMax ?? null,
      muscleTone: (row.muscleTone as BodyCompositionAnalysis["muscleTone"]) ?? null,
      weightKg: row.weightKg ?? null,
      weightSelfReported: Boolean(row.weightSelfReported),
      strongGroups: (row.strongGroups as string[]) ?? [],
      weakGroups: (row.weakGroups as string[]) ?? [],
      muscleMap: (row.muscleMap as BodyCompositionAnalysis["muscleMap"]) ?? {},
      fatPctTrend: (row.fatPctTrend as BodyCompositionAnalysis["fatPctTrend"]) ?? [],
      analysisHistory: (row.analysisHistory as string[]) ?? [],
      sourceProposalId: row.sourceProposalId ?? null,
      disclaimer: row.disclaimer,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/**
 * Builds the 8-week fat% trend array for a new analysis.
 * The trend carries at most 8 entries (one per analysis, oldest→newest).
 * Each entry uses the midpoint of [fatPctMin, fatPctMax] (or the single value if only one bound).
 */
function buildFatPctTrend(
  priorAnalyses: BodyCompositionAnalysis[],
  current: SaveBodyAnalysisProposalPayload,
): Array<{ weekStart: string; fatPctMid: number }> {
  const currentMid = computeFatPctMid(current.fatPctMin ?? null, current.fatPctMax ?? null);

  const priorEntries = priorAnalyses
    .slice(0, 7)
    .reverse()
    .flatMap((a) => {
      const mid = computeFatPctMid(a.fatPctMin, a.fatPctMax);
      return mid !== null ? [{ weekStart: a.date, fatPctMid: mid }] : [];
    });

  if (currentMid === null) {
    return priorEntries;
  }

  return [...priorEntries, { weekStart: current.date, fatPctMid: currentMid }].slice(-8);
}

function computeFatPctMid(min: number | null, max: number | null): number | null {
  if (min !== null && max !== null) {
    return (min + max) / 2;
  }
  if (min !== null) return min;
  if (max !== null) return max;
  return null;
}
