import { userProfiles } from "@health/db";
import type { UserProfile } from "@health/types";

type ProfileRow = typeof userProfiles.$inferSelect;

function toIsoDate(value: Date | string | null): string | null {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function toUserProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    userId: row.userId,
    birthDate: toIsoDate(row.birthDate),
    heightCm: row.heightCm,
    baselineWeightKg: row.baselineWeightKg,
    activityLevel: row.activityLevel,
    trainingExperience: row.trainingExperience,
    preferences: toStringList(row.preferences),
    constraints: toStringList(row.constraints),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
