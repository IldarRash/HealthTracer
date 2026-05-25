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

function toCoachingNotes(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowedCategories = new Set([
    "preference",
    "constraint",
    "context",
    "motivation",
  ]);

  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("text" in item) ||
      typeof item.text !== "string" ||
      item.text.length === 0
    ) {
      return [];
    }

    const category =
      "category" in item &&
      typeof item.category === "string" &&
      allowedCategories.has(item.category)
        ? (item.category as "preference" | "constraint" | "context" | "motivation")
        : undefined;

    return [{ text: item.text, category }];
  });
}

function toLongevityDirection(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("statement" in value) ||
    typeof value.statement !== "string" ||
    value.statement.length === 0
  ) {
    return null;
  }

  const tags = "tags" in value && Array.isArray(value.tags)
    ? value.tags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0)
    : [];

  return {
    statement: value.statement,
    tags,
  };
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
    longevityDirection: toLongevityDirection(row.longevityDirection),
    longevityDirectionTags: toStringList(row.longevityDirectionTags),
    coachingNotes: toCoachingNotes(row.coachingNotes),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
