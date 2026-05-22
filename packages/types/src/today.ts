import { z } from "zod";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";

export const todayChecklistItemKindSchema = z.enum([
  "workout",
  "nutrition",
  "hydration",
  "recovery",
  "habit",
]);

export type TodayChecklistItemKind = z.infer<typeof todayChecklistItemKindSchema>;

export const todayChecklistItemStatusSchema = z.enum([
  "pending",
  "completed",
  "skipped",
]);

export type TodayChecklistItemStatus = z.infer<typeof todayChecklistItemStatusSchema>;

export const todayChecklistItemSourceTypeSchema = z.enum([
  "workout_session",
  "ai_proposal",
  "custom",
  "generated",
]);

export type TodayChecklistItemSourceType = z.infer<
  typeof todayChecklistItemSourceTypeSchema
>;

export const todayChecklistItemSourceRefSchema = z.object({
  type: todayChecklistItemSourceTypeSchema,
  id: z.string().uuid().optional(),
});

export type TodayChecklistItemSourceRef = z.infer<
  typeof todayChecklistItemSourceRefSchema
>;

export const todayChecklistItemSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(160),
  kind: todayChecklistItemKindSchema,
  status: todayChecklistItemStatusSchema,
  required: z.boolean().default(true),
  source: todayChecklistItemSourceRefSchema,
});

export type TodayChecklistItem = z.infer<typeof todayChecklistItemSchema>;

export const todayChecklistProposalItemSchema = z.object({
  label: z.string().min(1).max(160),
  kind: todayChecklistItemKindSchema,
  completed: z.boolean().optional(),
  status: todayChecklistItemStatusSchema.optional(),
  required: z.boolean().optional(),
});

export type TodayChecklistProposalItem = z.infer<
  typeof todayChecklistProposalItemSchema
>;

export const todayChecklistPayloadSchema = z.object({
  date: isoDateSchema,
  items: z.array(todayChecklistProposalItemSchema).min(1).max(30),
});

export type TodayChecklistPayload = z.infer<typeof todayChecklistPayloadSchema>;

export const todayDailyFeedbackSchema = z.object({
  notes: z.string().max(500).nullable().optional(),
  energy: z.number().int().min(1).max(10).nullable().optional(),
  difficulty: z.number().int().min(1).max(10).nullable().optional(),
});

export type TodayDailyFeedback = z.infer<typeof todayDailyFeedbackSchema>;

export const todayAdherenceSummarySchema = z.object({
  score: z.number().min(0).max(1).nullable(),
  completedRequired: z.number().int().nonnegative(),
  totalRequired: z.number().int().nonnegative(),
  completedOptional: z.number().int().nonnegative(),
  skippedRequired: z.number().int().nonnegative(),
  skippedOptional: z.number().int().nonnegative(),
});

export type TodayAdherenceSummary = z.infer<typeof todayAdherenceSummarySchema>;

export const todayChecklistRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  date: isoDateSchema,
  items: z.array(todayChecklistItemSchema),
  source: z.string().min(1).max(80),
  feedback: todayDailyFeedbackSchema.nullable(),
  adherence: todayAdherenceSummarySchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type TodayChecklistRecord = z.infer<typeof todayChecklistRecordSchema>;

export const todayDayResponseSchema = todayChecklistRecordSchema;

export type TodayDayResponse = z.infer<typeof todayDayResponseSchema>;

export const updateTodayItemStatusSchema = z.object({
  status: todayChecklistItemStatusSchema.extract(["completed", "skipped"]),
});

export type UpdateTodayItemStatusInput = z.infer<typeof updateTodayItemStatusSchema>;

export const updateTodayFeedbackSchema = todayDailyFeedbackSchema;

export type UpdateTodayFeedbackInput = z.infer<typeof updateTodayFeedbackSchema>;

export const todayHistoryEntrySchema = z.object({
  date: isoDateSchema,
  adherence: todayAdherenceSummarySchema,
  itemCount: z.number().int().nonnegative(),
  hasFeedback: z.boolean(),
});

export type TodayHistoryEntry = z.infer<typeof todayHistoryEntrySchema>;

export const todayHistoryResponseSchema = z.object({
  entries: z.array(todayHistoryEntrySchema),
});

export type TodayHistoryResponse = z.infer<typeof todayHistoryResponseSchema>;

export const todayHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(7),
});

export type TodayHistoryQuery = z.infer<typeof todayHistoryQuerySchema>;

export function resolveProposalItemStatus(
  item: TodayChecklistProposalItem,
): TodayChecklistItemStatus {
  if (item.status) {
    return item.status;
  }

  if (item.completed === true) {
    return "completed";
  }

  return "pending";
}

export function calculateTodayAdherence(
  items: Pick<TodayChecklistItem, "status" | "required">[],
): TodayAdherenceSummary {
  let completedRequired = 0;
  let totalRequired = 0;
  let completedOptional = 0;
  let skippedRequired = 0;
  let skippedOptional = 0;

  for (const item of items) {
    const isRequired = item.required !== false;

    if (isRequired) {
      totalRequired += 1;

      if (item.status === "completed") {
        completedRequired += 1;
      } else if (item.status === "skipped") {
        skippedRequired += 1;
      }
    } else if (item.status === "completed") {
      completedOptional += 1;
    } else if (item.status === "skipped") {
      skippedOptional += 1;
    }
  }

  const score =
    totalRequired === 0 ? null : Math.round((completedRequired / totalRequired) * 10000) / 10000;

  return {
    score,
    completedRequired,
    totalRequired,
    completedOptional,
    skippedRequired,
    skippedOptional,
  };
}
