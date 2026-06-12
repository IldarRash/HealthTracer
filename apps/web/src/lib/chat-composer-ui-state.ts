/**
 * Pure helpers for chat composer keyboard and send behavior.
 * No DOM/React dependencies — fully unit-testable.
 */

type ShouldSendOnEnterOptions = {
  /** The key value from the keyboard event (e.g. "Enter", "a", etc.) */
  key: string;
  /** Whether Shift is held (Shift+Enter inserts a newline instead of sending) */
  shiftKey: boolean;
  /**
   * Whether the key event is synthesized by an IME composition session
   * (e.g. CJK input methods composing characters before committing).
   * When true, Enter should not trigger send — it commits the composition.
   */
  isComposing: boolean;
};

/**
 * Returns true when a textarea keydown event should trigger message send.
 *
 * Rules:
 * - Enter alone → send
 * - Shift+Enter → newline (returns false)
 * - Any non-Enter key → false
 * - Enter during IME composition → false (commits composition, not send)
 */
export function shouldSendOnEnter(options: ShouldSendOnEnterOptions): boolean {
  const { key, shiftKey, isComposing } = options;
  if (key !== "Enter") {
    return false;
  }
  if (shiftKey) {
    return false;
  }
  if (isComposing) {
    return false;
  }
  return true;
}
