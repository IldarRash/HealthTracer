/**
 * chat-turn.ts — Chat turn schemas.
 *
 * Extracted from index.ts so that chat-turn-stream.ts can import
 * chatTurnResponseSchema without going through the barrel index.ts,
 * which would create a circular dependency:
 *   index.ts → (re-export) chat-turn-stream.ts → chatTurnResponseSchema → index.ts
 *
 * This module imports only from dedicated sub-modules, never from index.ts.
 */

import { z } from "zod";
import { isoDateTimeSchema } from "./dates.js";
import { chatAttachmentOutcomeSchema, chatMessageAttachmentMetaSchema } from "./chat-attachments.js";
import { aiProposalSchema } from "./ai-proposal.js";
import type { AiProposal } from "./ai-proposal.js";
import { directChatPathKindSchema } from "./direct-chat-path.js";

// ---------------------------------------------------------------------------
// Chat thread / message schemas
// ---------------------------------------------------------------------------

export const chatMessageRoleSchema = z.enum(["user", "assistant", "system"]);

export type ChatMessageRole = z.infer<typeof chatMessageRoleSchema>;

export const chatThreadSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().min(1).max(160).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type ChatThread = z.infer<typeof chatThreadSchema>;

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string().uuid(),
  role: chatMessageRoleSchema,
  content: z.string().min(1).max(8000),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: isoDateTimeSchema,
  /** Display-only attachment metadata populated from linked chat_attachments rows. No bytes, storageKey, consent, or recognition payloads. */
  attachments: z.array(chatMessageAttachmentMetaSchema).default([]),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

// ---------------------------------------------------------------------------
// Turn-error contract — surfaced on assistant messages for error card rendering.
// Stored in assistant message metadata.turnError and mirrored to ChatTurnResponse
// so the SSE final event carries it.
// ---------------------------------------------------------------------------

/**
 * Schema for a turn-level error — present when the AI pipeline could not
 * produce an honest reply (decision_failed) or the reply was safety-blocked
 * (reply_blocked). The assistant message is persisted with empty content and
 * this error marker so the frontend can render an error card instead of coach prose.
 *
 * Crisis, quota, direct-path, and proposal-explainer replies are product features
 * and never set turnError.
 */
export const chatTurnErrorSchema = z.object({
  reason: z.enum(["decision_failed", "reply_blocked"]),
});

export type ChatTurnError = z.infer<typeof chatTurnErrorSchema>;

/**
 * Parse the turn-error from an assistant message's metadata field.
 * Returns the parsed object if present and valid, null otherwise.
 * Tolerant of unknown or missing keys — never throws.
 */
export function parseChatMessageTurnError(
  metadata: Record<string, unknown> | null | undefined,
): ChatTurnError | null {
  if (!metadata || typeof metadata.turnError !== "object" || metadata.turnError === null) {
    return null;
  }

  const parsed = chatTurnErrorSchema.safeParse(metadata.turnError);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// ChatTurnResponse — the complete validated turn payload emitted by both the
// sync and streaming endpoints.
// ---------------------------------------------------------------------------

export const suggestedQuickActionSchema = z.object({
  id: directChatPathKindSchema,
  labelEn: z.string().min(1).max(120),
  labelRu: z.string().min(1).max(120),
  messageText: z.object({
    en: z.string().min(1).max(240),
    ru: z.string().min(1).max(240),
  }),
});

export type SuggestedQuickAction = z.infer<typeof suggestedQuickActionSchema>;

export const chatTurnResponseSchema = z.object({
  thread: chatThreadSchema,
  userMessage: chatMessageSchema,
  assistantMessage: chatMessageSchema,
  proposals: z.array(aiProposalSchema),
  attachmentOutcomes: z.array(z.lazy(() => chatAttachmentOutcomeSchema)).optional(),
  /**
   * When true, the AI pipeline produced a consent-gated outcome that requires
   * explicit user consent before anything is persisted. The UI should surface a
   * distinct consent prompt when this flag is present. Nothing is auto-persisted
   * regardless of this value.
   */
  consentRequired: z.boolean().optional(),
  /**
   * Present when the AI pipeline could not produce an honest reply.
   * reason=decision_failed: decision-maker failed after retry; no coach text.
   * reason=reply_blocked: reply safety validation blocked the synthesized reply; proposals dropped.
   * The assistant message is persisted with empty content and this error marker.
   * The frontend should render an error card instead of coach prose.
   */
  turnError: chatTurnErrorSchema.optional(),
  /**
   * Suggested quick-action chips for LLM-backed turns only.
   * Derived deterministically from the selected domains in the fan-out plan.
   * Absent on pre-AI gate turns (crisis, quota, direct-path, explainer-no-proposal)
   * and on turnError turns.
   */
  suggestedQuickActions: z.array(suggestedQuickActionSchema).optional(),
});

export type ChatTurnResponse = z.infer<typeof chatTurnResponseSchema>;

// Re-export AiProposal so callers that reference ChatTurnResponse don't need
// a second import from ai-proposal.ts.
export type { AiProposal };

// ---------------------------------------------------------------------------
// Degraded-turn metadata — stored in assistant message metadata.turnDegraded
//
// Semantic split (mutually exclusive — ChatService enforces this):
//   turnError    = no usable reply produced. Content is persisted as " " (space)
//                  and the frontend renders an error card instead of coach prose.
//                  Reasons: decision_failed, reply_blocked.
//   turnDegraded = a usable reply was persisted, but some pipeline stage degraded
//                  (quality marker). No error card — the reply is shown as-is.
//
// When turnError is set, turnDegraded is NOT written. When only a stage degrades
// (but a reply is still available), only turnDegraded is written.
// ---------------------------------------------------------------------------

/**
 * Reason codes for a degraded AI turn.
 * - reply_blocked: reply safety validation blocked the reply (proposals dropped)
 * - parse_failed: all domain LLMs degraded (parse/output failure)
 * - provider_error: upstream LLM provider error
 * - decision_failed: decision-maker failed after retry (no honest reply available)
 */
export const chatTurnDegradedReasonSchema = z.enum([
  "reply_blocked",
  "parse_failed",
  "provider_error",
  "decision_failed",
]);

export type ChatTurnDegradedReason = z.infer<typeof chatTurnDegradedReasonSchema>;

/**
 * Schema for the turnDegraded sub-object stored in assistant message metadata.
 */
export const chatMessageDegradedTurnSchema = z.object({
  degraded: z.literal(true),
  reason: chatTurnDegradedReasonSchema,
});

export type ChatMessageDegradedTurn = z.infer<typeof chatMessageDegradedTurnSchema>;

/**
 * Parse the degraded-turn metadata from an assistant message's metadata field.
 * Returns the parsed object if present and valid, null otherwise.
 * Tolerant of unknown or missing keys — never throws.
 */
export function parseChatMessageDegradedTurn(
  metadata: Record<string, unknown> | null | undefined,
): ChatMessageDegradedTurn | null {
  if (!metadata || typeof metadata.turnDegraded !== "object" || metadata.turnDegraded === null) {
    return null;
  }

  const parsed = chatMessageDegradedTurnSchema.safeParse(metadata.turnDegraded);
  return parsed.success ? parsed.data : null;
}
