/**
 * Shared message-length caps used across the chat pipeline.
 *
 * MAX_CHAT_USER_MESSAGE_CHARS — the maximum length accepted by the API for a
 *   user chat message. Large programs (workout routines, meal plans, etc.) can
 *   easily exceed 4 000 characters, so this cap is intentionally large.
 *
 * ROUTER_TEXT_MAX_CHARS — the router only needs the head of the message to
 *   determine which domain(s) to fan-out to; domain LLMs receive the full text.
 *   Keeping the router input small prevents schema parse failures on long pastes.
 */

export const MAX_CHAT_USER_MESSAGE_CHARS = 20_000;
export const ROUTER_TEXT_MAX_CHARS = 4_000;

/**
 * Truncates `text` to ROUTER_TEXT_MAX_CHARS for use in the router LLM request.
 *
 * The router only needs the head of the message to decide which domains to
 * select — domain LLMs always receive the full, un-truncated message.
 */
export function truncateForRouter(text: string): string {
  return text.slice(0, ROUTER_TEXT_MAX_CHARS);
}
