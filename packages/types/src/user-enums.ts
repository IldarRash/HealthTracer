/**
 * user-enums.ts — User and goal enum schemas.
 *
 * Extracted from index.ts so that ai-proposal.ts can import these without
 * going through the barrel index.ts (which would create a circular dependency
 * via the chat-turn-stream re-export chain).
 */

import { z } from "zod";

export const activityLevelSchema = z.enum([
  "sedentary",
  "lightly_active",
  "moderately_active",
  "very_active",
  "athlete",
]);

export type ActivityLevel = z.infer<typeof activityLevelSchema>;

export const trainingExperienceSchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
]);

export type TrainingExperience = z.infer<typeof trainingExperienceSchema>;

export const goalTypeSchema = z.enum([
  "fat_loss",
  "muscle_gain",
  "maintenance",
  "endurance",
  "general_wellness",
]);

export type GoalType = z.infer<typeof goalTypeSchema>;

export const goalStatusSchema = z.enum(["active", "paused", "completed", "archived"]);

export type GoalStatus = z.infer<typeof goalStatusSchema>;

export const goalPrioritySchema = z.enum(["primary", "secondary"]);

export type GoalPriority = z.infer<typeof goalPrioritySchema>;
