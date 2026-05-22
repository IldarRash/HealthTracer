import { userProfiles } from "@health/db";
import type { UserProfile } from "@health/types";

type ProfileRow = typeof userProfiles.$inferSelect;

export function toUserProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    userId: row.userId,
    birthDate: row.birthDate,
    heightCm: row.heightCm,
    baselineWeightKg: row.baselineWeightKg,
    activityLevel: row.activityLevel,
    trainingExperience: row.trainingExperience,
    preferences: row.preferences,
    constraints: row.constraints,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
