/**
 * chatBodyFlow — client-side state machine for the body-analysis chat flow.
 *
 * Flow: ask → uploading → analyzing → result → saved
 *
 * - ask:       coach has requested 3 body photos; PhotoGuide is shown after the coach message.
 * - uploading: user selected files from PhotoGuide; they are in the composer draft.
 * - analyzing: user sent the photo message; sendMessageMutation is pending.
 * - result:    the AI returned a save_body_analysis proposal.
 * - saved:     user accepted the proposal.
 *
 * Detection:
 * - "ask" is triggered when the latest assistant message has `bodyPhotoRequest: true` in
 *   metadata, OR its text content matches the body-photo-request content pattern.
 * - "result"/"saved" are tracked locally via the proposal state.
 *
 * Safety: this module is purely presentational — it computes UI state from
 * already-resolved server data. It never uploads, mutates, or persists anything.
 */

import type { AiProposal, ChatMessage } from "@health/types";
import type { DisplayChatMessage } from "./chat-ui-state.js";

// ── Types ─────────────────────────────────────────────────────────

export type ChatBodyFlowStep = "ask" | "uploading" | "analyzing" | "result" | "saved";

export type ChatBodyFlowState = {
  step: ChatBodyFlowStep;
  /** Message ID of the coach message that requested photos (null outside the flow). */
  requestMessageId: string | null;
};

export const CHAT_BODY_FLOW_IDLE: ChatBodyFlowState = {
  step: "ask",
  requestMessageId: null,
};

// ── Detection ─────────────────────────────────────────────────────

/**
 * Pattern used to detect a body-photo-request coach message by content.
 * Matches the verbatim design-spec phrase fragments (RU):
 *   "Пришлите" + "три снимка" or "три фото" or "ракурсов"
 *
 * This is a soft heuristic — the preferred path is `bodyPhotoRequest: true` metadata.
 */
const BODY_PHOTO_REQUEST_CONTENT_PATTERN =
  /Пришлите.{0,80}(три\s+(снимка|фото)|ракурсов)/is;

/**
 * Returns true if the given assistant message signals a body-photo request.
 * Checks explicit metadata flag first, falls back to content pattern.
 */
export function isBodyPhotoRequestMessage(
  message: Pick<ChatMessage, "role" | "content" | "metadata">,
): boolean {
  if (message.role !== "assistant") {
    return false;
  }

  // Explicit metadata flag (preferred — set by the backend when the AI asks for photos).
  if (message.metadata.bodyPhotoRequest === true) {
    return true;
  }

  // Content-pattern fallback for coach replies that predate the metadata flag.
  return BODY_PHOTO_REQUEST_CONTENT_PATTERN.test(message.content);
}

/**
 * Resolves the latest body-photo-request message from the display messages array.
 * Returns the message, or null if none found.
 */
export function resolveBodyPhotoRequestMessage(
  messages: readonly DisplayChatMessage[],
): DisplayChatMessage | null {
  // Iterate backwards to find the most recent request.
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg && "optimistic" in msg && msg.optimistic) {
      // Optimistic messages are user messages — skip.
      continue;
    }

    if (msg && isBodyPhotoRequestMessage(msg as Pick<ChatMessage, "role" | "content" | "metadata">)) {
      return msg;
    }
  }

  return null;
}

/**
 * Returns true if the proposals for a given message include a save_body_analysis intent.
 */
export function hasBodyAnalysisProposal(proposals: readonly AiProposal[]): boolean {
  return proposals.some((p) => p.intent === "save_body_analysis");
}

/**
 * Returns true if all save_body_analysis proposals in the list are accepted.
 */
export function isBodyAnalysisProposalSaved(proposals: readonly AiProposal[]): boolean {
  const bodyProposals = proposals.filter((p) => p.intent === "save_body_analysis");
  if (bodyProposals.length === 0) return false;
  return bodyProposals.every((p) => p.status === "accepted");
}

// ── ThinkingBlock label ────────────────────────────────────────────

/**
 * Label shown in the ThinkingBlock during the "analyzing" step.
 * Verbatim from the design spec (RU — intentional, body-flow copy).
 */
export const BODY_ANALYSIS_THINKING_LABEL =
  "Коуч анализирует фото · оцениваю состав и мышцы…";
