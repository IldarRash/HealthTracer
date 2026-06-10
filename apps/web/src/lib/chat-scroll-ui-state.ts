/**
 * Pure scroll-model helpers for the chat transcript.
 * No DOM/React dependencies — fully unit-testable.
 */

/**
 * Returns true when the scroll position is within `threshold` pixels of the bottom.
 */
export function isNearBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  threshold = 96,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

type ShouldAutoScrollInput = {
  /**
   * Was the viewport near the bottom before the new messages arrived?
   * Set from the previous scroll event via isNearBottom.
   */
  wasNearBottom: boolean;
  /**
   * True when the last message in the list is an optimistic user message
   * (i.e. the current user just sent something).
   */
  lastMessageIsOwnOptimistic: boolean;
  /**
   * True on the very first load of the transcript (no prior scroll position).
   */
  isInitialLoad: boolean;
};

/**
 * Decide whether to auto-scroll to the bottom when messages change.
 * Auto-scrolls when:
 *  - initial thread load (jump to bottom immediately on mount)
 *  - the user is near the bottom of the transcript
 *  - the user themselves just sent a message (own optimistic message)
 */
export function shouldAutoScroll({
  wasNearBottom,
  lastMessageIsOwnOptimistic,
  isInitialLoad,
}: ShouldAutoScrollInput): boolean {
  return isInitialLoad || wasNearBottom || lastMessageIsOwnOptimistic;
}
