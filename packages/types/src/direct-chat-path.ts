import { z } from "zod";
import { buildDefaultDirectPathKindMatchers } from "./direct-chat-path-default-patterns.js";

export const directChatPathKindSchema = z.enum([
  "today_summary_read",
  "mark_today_workout_done",
]);

export type DirectChatPathKind = z.infer<typeof directChatPathKindSchema>;

export const directChatPathRoutingMethodSchema = z.literal("rule_based");

export type DirectChatPathRoutingMethod = z.infer<typeof directChatPathRoutingMethodSchema>;

export const directChatPathCandidateSchema = z.object({
  kind: directChatPathKindSchema,
  confidence: z.number().min(0).max(1),
  routingMethod: directChatPathRoutingMethodSchema,
});

export type DirectChatPathCandidate = z.infer<typeof directChatPathCandidateSchema>;

export const directChatPathOutcomeStatusSchema = z.enum([
  "executed",
  "clarification_required",
  "no_op",
]);

export type DirectChatPathOutcomeStatus = z.infer<typeof directChatPathOutcomeStatusSchema>;

export const directChatPathRefreshHintSchema = z.enum([
  "today",
  "dashboard",
  "longevity",
]);

export type DirectChatPathRefreshHint = z.infer<typeof directChatPathRefreshHintSchema>;

export const directChatPathOutcomeSchema = z.object({
  kind: directChatPathKindSchema,
  status: directChatPathOutcomeStatusSchema,
  message: z.string().min(1).max(2000).optional(),
  refreshHints: z.array(directChatPathRefreshHintSchema).max(5).default([]),
});

export type DirectChatPathOutcome = z.infer<typeof directChatPathOutcomeSchema>;

export const directChatPathMetadataSchema = z.object({
  candidate: directChatPathCandidateSchema.nullable(),
  outcome: directChatPathOutcomeSchema.optional(),
});

export type DirectChatPathMetadata = z.infer<typeof directChatPathMetadataSchema>;

export type DetectDirectChatPathCandidateOptions = {
  hasAttachments?: boolean;
};

export function defaultRefreshHintsForDirectPathKind(
  kind: DirectChatPathKind,
  outcomeStatus: DirectChatPathOutcomeStatus,
): DirectChatPathRefreshHint[] {
  if (outcomeStatus !== "executed") {
    return [];
  }

  const kindConfig = buildDefaultDirectPathKindMatchers().find((entry) => entry.kind === kind);
  return kindConfig ? [...kindConfig.refreshHintsOnExecuted] : [];
}
