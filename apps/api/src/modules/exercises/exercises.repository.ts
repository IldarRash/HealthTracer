import { exercises } from "@health/db";
import type { CreateExerciseInput, ExerciseListQuery } from "@health/types";
import {
  buildExerciseDedupeKeyFromName,
  normalizeExerciseName,
} from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

export interface CreateExerciseRecordInput extends CreateExerciseInput {
  userId: string | null;
  validationStatus?: "validated" | "pending_validation" | "rejected";
}

@Injectable()
export class ExercisesRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async listActiveExercises(filters: ExerciseListQuery, userId?: string | null) {
    const conditions = [eq(exercises.status, "active")];

    if (filters.source) {
      conditions.push(eq(exercises.source, filters.source));
    }

    if (filters.difficulty) {
      conditions.push(eq(exercises.difficulty, filters.difficulty));
    }

    if (filters.primaryMuscle) {
      conditions.push(
        sql`${exercises.primaryMuscles} @> ${JSON.stringify([filters.primaryMuscle])}::jsonb`,
      );
    }

    if (filters.movementPattern) {
      conditions.push(
        sql`${exercises.movementPatterns} @> ${JSON.stringify([filters.movementPattern])}::jsonb`,
      );
    }

    if (filters.equipment?.length) {
      for (const item of filters.equipment) {
        conditions.push(
          sql`${exercises.equipment} @> ${JSON.stringify([item])}::jsonb`,
        );
      }
    }

    if (filters.search) {
      const normalizedSearch = normalizeExerciseName(filters.search);
      conditions.push(
        or(
          ilike(exercises.name, `%${filters.search.trim()}%`),
          ilike(exercises.normalizedName, `%${normalizedSearch}%`),
          sql`${exercises.aliases} @> ${JSON.stringify([filters.search.trim()])}::jsonb`,
        )!,
      );
    }

    if (userId) {
      if (filters.includeUserCreated) {
        conditions.push(or(isNull(exercises.userId), eq(exercises.userId, userId))!);
      } else {
        conditions.push(isNull(exercises.userId));
      }
    } else {
      conditions.push(isNull(exercises.userId));
    }

    return this.db
      .select()
      .from(exercises)
      .where(and(...conditions))
      .orderBy(exercises.name);
  }

  async findActiveExerciseById(exerciseId: string, userId?: string | null) {
    const visibility = userId
      ? or(isNull(exercises.userId), eq(exercises.userId, userId))
      : isNull(exercises.userId);

    const [row] = await this.db
      .select()
      .from(exercises)
      .where(
        and(eq(exercises.id, exerciseId), eq(exercises.status, "active"), visibility),
      )
      .limit(1);

    return row ?? null;
  }

  async findActiveExercisesByIds(exerciseIds: string[], userId?: string | null) {
    if (exerciseIds.length === 0) {
      return [];
    }

    const visibility = userId
      ? or(isNull(exercises.userId), eq(exercises.userId, userId))
      : isNull(exercises.userId);

    return this.db
      .select()
      .from(exercises)
      .where(
        and(
          inArray(exercises.id, exerciseIds),
          eq(exercises.status, "active"),
          visibility,
        ),
      );
  }

  async findActiveByDedupeKey(dedupeKey: string, userId?: string | null) {
    if (userId) {
      const [systemMatch] = await this.db
        .select()
        .from(exercises)
        .where(
          and(
            eq(exercises.dedupeKey, dedupeKey),
            eq(exercises.status, "active"),
            isNull(exercises.userId),
          ),
        )
        .limit(1);

      if (systemMatch) {
        return systemMatch;
      }

      const [userMatch] = await this.db
        .select()
        .from(exercises)
        .where(
          and(
            eq(exercises.dedupeKey, dedupeKey),
            eq(exercises.status, "active"),
            eq(exercises.userId, userId),
          ),
        )
        .limit(1);

      return userMatch ?? null;
    }

    const [row] = await this.db
      .select()
      .from(exercises)
      .where(
        and(
          eq(exercises.dedupeKey, dedupeKey),
          eq(exercises.status, "active"),
          isNull(exercises.userId),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async createExercise(input: CreateExerciseRecordInput) {
    const normalizedName = normalizeExerciseName(input.name);
    const dedupeKey = buildExerciseDedupeKeyFromName({
      name: input.name,
      equipment: input.equipment,
      primaryMuscles: input.primaryMuscles,
    });
    const now = new Date();

    const [row] = await this.db
      .insert(exercises)
      .values({
        name: input.name.trim(),
        normalizedName,
        aliases: input.aliases,
        primaryMuscles: input.primaryMuscles,
        secondaryMuscles: input.secondaryMuscles,
        equipment: input.equipment,
        movementPatterns: input.movementPatterns,
        difficulty: input.difficulty,
        instructions: input.instructions,
        safetyNotes: input.safetyNotes,
        source: input.source,
        validationStatus:
          input.validationStatus ??
          (input.source === "ai_generated" ? "pending_validation" : "validated"),
        status: "active",
        userId: input.userId,
        dedupeKey,
        updatedAt: now,
      })
      .returning();

    return row ?? null;
  }
}
