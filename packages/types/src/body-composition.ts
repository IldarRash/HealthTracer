import { z } from "zod";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";

/**
 * Safety disclaimer text rendered on every body-composition card.
 * This is a code-level constant — the UI must always display it.
 */
export const BODY_ANALYSIS_DISCLAIMER =
  "примерная визуальная оценка по фото, не замер состава тела и не диагноз" as const;

export const muscleToneSchema = z.enum(["above_average", "average", "below_average"]);
export type MuscleTone = z.infer<typeof muscleToneSchema>;

export const muscleGroupToneSchema = z.enum(["strong", "mid", "weak"]);
export type MuscleGroupTone = z.infer<typeof muscleGroupToneSchema>;

/** Entry in the 8-week fat% trend array. */
export const fatPctTrendEntrySchema = z.object({
  weekStart: isoDateSchema,
  fatPctMid: z.number().min(0).max(100),
});
export type FatPctTrendEntry = z.infer<typeof fatPctTrendEntrySchema>;

/**
 * Proposal payload for the save_body_analysis intent.
 * The AI emits this; backend validates and persists on accept.
 * Photos are NEVER included — numbers only.
 */
export const saveBodyAnalysisProposalPayloadSchema = z.object({
  date: isoDateSchema,
  source: z.literal("chat"),
  /** Estimated fat % lower bound. Visual estimate only — not a medical measurement. */
  fatPctMin: z.number().min(0).max(100).nullable().optional(),
  /** Estimated fat % upper bound. Visual estimate only — not a medical measurement. */
  fatPctMax: z.number().min(0).max(100).nullable().optional(),
  muscleTone: muscleToneSchema.nullable().optional(),
  /** User-self-reported weight in kg. Not derived from photos. */
  weightKg: z.number().positive().max(500).nullable().optional(),
  weightSelfReported: z.boolean().default(true),
  strongGroups: z.array(z.string().min(1).max(80)).max(20).default([]),
  weakGroups: z.array(z.string().min(1).max(80)).max(20).default([]),
  /**
   * Per-muscle-group tone. Keys are canonical muscle-group slugs.
   * Values are 'strong' | 'mid' | 'weak'.
   */
  muscleMap: z.record(z.string(), muscleGroupToneSchema).default({}),
});

export type SaveBodyAnalysisProposalPayload = z.infer<
  typeof saveBodyAnalysisProposalPayloadSchema
>;

/**
 * Domain errors for a save_body_analysis proposal payload.
 * Returns an empty array if valid; non-empty array of error strings if invalid.
 */
export function getSaveBodyAnalysisDomainErrors(
  payload: SaveBodyAnalysisProposalPayload,
): string[] {
  const errors: string[] = [];

  if (payload.fatPctMin != null && payload.fatPctMax != null) {
    if (payload.fatPctMin > payload.fatPctMax) {
      errors.push(
        "body: fatPctMin must be less than or equal to fatPctMax.",
      );
    }
  }

  const hasBodyData =
    payload.fatPctMin != null ||
    payload.fatPctMax != null ||
    payload.muscleTone != null ||
    Object.keys(payload.muscleMap).length > 0 ||
    payload.strongGroups.length > 0 ||
    payload.weakGroups.length > 0 ||
    payload.weightKg != null;

  if (!hasBodyData) {
    errors.push(
      "body: At least one body composition measurement is required (fat %, muscle tone, muscle map, or weight).",
    );
  }

  return errors;
}

/** Persisted body-composition analysis record (read API response shape). */
export const bodyCompositionAnalysisSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  date: isoDateSchema,
  source: z.string().min(1).max(40),
  fatPctMin: z.number().min(0).max(100).nullable(),
  fatPctMax: z.number().min(0).max(100).nullable(),
  muscleTone: muscleToneSchema.nullable(),
  weightKg: z.number().positive().max(500).nullable(),
  weightSelfReported: z.boolean(),
  strongGroups: z.array(z.string().min(1).max(80)).default([]),
  weakGroups: z.array(z.string().min(1).max(80)).default([]),
  muscleMap: z.record(z.string(), muscleGroupToneSchema).default({}),
  fatPctTrend: z.array(fatPctTrendEntrySchema).max(8).default([]),
  analysisHistory: z.array(z.string().uuid()).default([]),
  sourceProposalId: z.string().uuid().nullable(),
  disclaimer: z.string().min(1),
  createdAt: isoDateTimeSchema,
});

export type BodyCompositionAnalysis = z.infer<typeof bodyCompositionAnalysisSchema>;

export const bodyCompositionAnalysisResponseSchema = z.object({
  analysis: bodyCompositionAnalysisSchema.nullable(),
});

export type BodyCompositionAnalysisResponse = z.infer<
  typeof bodyCompositionAnalysisResponseSchema
>;
