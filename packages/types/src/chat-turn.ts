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
// ChatTurnResponse — the complete validated turn payload emitted by both the
// sync and streaming endpoints.
// ---------------------------------------------------------------------------

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
});

export type ChatTurnResponse = z.infer<typeof chatTurnResponseSchema>;

// Re-export AiProposal so callers that reference ChatTurnResponse don't need
// a second import from ai-proposal.ts.
export type { AiProposal };
