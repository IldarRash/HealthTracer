import { goals, userProfiles, users } from "@health/db";
import type { OnboardingInput } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { isPostgresUniqueViolation } from "../../database/postgres-errors.js";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

export class DuplicateActiveQuarterlyGoalError extends Error {
  constructor() {
    super("goal: At most 1 active quarterly goal is allowed.");
    this.name = "DuplicateActiveQuarterlyGoalError";
  }
}

@Injectable()
export class OnboardingRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async completeOnboarding(userId: string, input: OnboardingInput) {
    const completedAt = new Date();

    return this.db.transaction(async (tx) => {
      const [updatedUser] = await tx
        .update(users)
        .set({
          displayName: input.user.displayName,
          timezone: input.user.timezone,
          onboardingCompletedAt: completedAt,
          updatedAt: completedAt,
        })
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        throw new Error("Failed to update user during onboarding.");
      }

      const profileValues = {
        userId,
        birthDate: input.profile.birthDate ?? null,
        heightCm: input.profile.heightCm ?? null,
        baselineWeightKg: input.profile.baselineWeightKg ?? null,
        activityLevel: input.profile.activityLevel ?? null,
        trainingExperience: input.profile.trainingExperience ?? null,
        preferences: input.profile.preferences ?? [],
        constraints: input.profile.constraints ?? [],
        longevityDirection: input.profile.longevityDirection,
        longevityDirectionTags: input.profile.longevityDirection.tags ?? [],
        coachingNotes: input.profile.coachingNotes ?? [],
        onboardingDraft: null,
        updatedAt: completedAt,
      };

      const [profile] = await tx
        .insert(userProfiles)
        .values(profileValues)
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: profileValues,
        })
        .returning();

      if (!profile) {
        throw new Error("Failed to upsert profile during onboarding.");
      }

      const [existingQuarterlyGoal] = await tx
        .select({ id: goals.id })
        .from(goals)
        .where(
          and(
            eq(goals.userId, userId),
            eq(goals.status, "active"),
            eq(goals.horizon, "quarterly"),
          ),
        )
        .limit(1);

      if (existingQuarterlyGoal) {
        throw new DuplicateActiveQuarterlyGoalError();
      }

      let quarterlyGoal;

      try {
        [quarterlyGoal] = await tx
          .insert(goals)
          .values({
            userId,
            type: input.quarterlyGoal.type,
            priority: input.quarterlyGoal.priority,
            title: input.quarterlyGoal.title,
            target: input.quarterlyGoal.target,
            horizon: "quarterly",
            status: "active",
            startDate: input.quarterlyGoal.startDate,
            targetDate: input.quarterlyGoal.targetDate,
          })
          .returning();
      } catch (error) {
        if (isPostgresUniqueViolation(error)) {
          throw new DuplicateActiveQuarterlyGoalError();
        }

        throw error;
      }

      if (!quarterlyGoal) {
        throw new Error("Failed to create quarterly goal during onboarding.");
      }

      return {
        user: updatedUser,
        profile,
        quarterlyGoal,
      };
    });
  }
}
