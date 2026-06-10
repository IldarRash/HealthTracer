import { z } from "zod";
import { chatTurnResponseSchema } from "./chat-turn.js";
import { routerDomainSchema } from "./router-decision.js";

// ---------------------------------------------------------------------------
// Stage names emitted during a streaming chat turn.
//
// Privacy rule: stage events carry NO user content, NO reply text, NO proposal
// payloads, NO health data — only structural info (stage name, selected domain
// names, counts, booleans). The single `final` event carries the complete
// validated ChatTurnResponse.
// ---------------------------------------------------------------------------

export const chatTurnStreamStageSchema = z.enum([
  "preprocessing",
  "routing",
  "domains_running",
  "synthesis",
  "validating",
]);

export type ChatTurnStreamStage = z.infer<typeof chatTurnStreamStageSchema>;

// ---------------------------------------------------------------------------
// Discriminated union of SSE event kinds
// ---------------------------------------------------------------------------

/** Emitted synchronously once the turn is accepted and the user message is persisted. */
const turnAcceptedEventSchema = z.object({
  kind: z.literal("turn_accepted"),
  threadId: z.string(),
  userMessageId: z.string().optional(),
});

/**
 * Emitted at each coarse pipeline stage.
 *
 * `selectedDomains` is present only for the `domains_running` stage (after
 * SystemPlanner produced the fan-out plan). It carries domain names only —
 * never intents, capabilities, or any content that might leak routing decisions
 * beyond domain-level granularity.
 */
const stageEventSchema = z.object({
  kind: z.literal("stage"),
  stage: chatTurnStreamStageSchema,
  selectedDomains: z.array(routerDomainSchema).optional(),
});

/**
 * The final event. Carries the exact same validated ChatTurnResponse that the
 * synchronous endpoint returns. This is the ONLY event that carries any user
 * content (the assistant message text and validated proposals).
 *
 * Safety floor: the response has already passed validateReplySafety and the
 * full ProposalValidationService stack before this event is emitted.
 */
const finalEventSchema = z.object({
  kind: z.literal("final"),
  response: chatTurnResponseSchema,
});

/**
 * Emitted when the turn throws an unrecoverable error.
 *
 * `message` is a safe generic copy only — never internals, stack traces,
 * or health data. The sendMessage error path persists nothing extra (it follows
 * ChatService's own error handling). The stream closes after this event.
 */
const errorEventSchema = z.object({
  kind: z.literal("error"),
  message: z.string(),
});

export const chatTurnStreamEventSchema = z.discriminatedUnion("kind", [
  turnAcceptedEventSchema,
  stageEventSchema,
  finalEventSchema,
  errorEventSchema,
]);

export type ChatTurnStreamEvent = z.infer<typeof chatTurnStreamEventSchema>;
export type ChatTurnStreamTurnAcceptedEvent = z.infer<typeof turnAcceptedEventSchema>;
export type ChatTurnStreamStageEvent = z.infer<typeof stageEventSchema>;
export type ChatTurnStreamFinalEvent = z.infer<typeof finalEventSchema>;
export type ChatTurnStreamErrorEvent = z.infer<typeof errorEventSchema>;

// ---------------------------------------------------------------------------
// ProgressReporter — the narrow callback type threaded through the pipeline.
//
// Only stage events are reported through the callback; `turn_accepted` and
// `final` are emitted by ChatService directly (it holds the response). Callback
// failures must NEVER break the turn — callers wrap invocations in try/catch.
// ---------------------------------------------------------------------------

export type ProgressReporter = (event: ChatTurnStreamStageEvent) => void;
