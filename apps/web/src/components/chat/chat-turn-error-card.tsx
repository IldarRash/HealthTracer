"use client";

import { useTranslations } from "next-intl";

type ChatTurnErrorCardProps = {
  /** Called when the user clicks Retry — resends the preceding user message. */
  onRetry: () => void;
  /**
   * The turnError reason (Chat.turnError.* copy) — the single honest-failure
   * contract for reply-absent turns.
   *
   * reason="decision_failed" — generic pipeline failure, no extra body line.
   * reason="reply_blocked" — safety-blocked reply, adds a second body line.
   */
  reason: "decision_failed" | "reply_blocked";
  /** Disable the retry button while a send is in flight. */
  disabled?: boolean;
};

/**
 * Error card rendered in place of the coach reply text when a turn fails
 * (metadata.turnError — reply absent). This is the only error-card path;
 * degraded-but-replied turns (metadata.turnDegraded) render their reply as-is.
 *
 * Design: coach avatar row + red-tinted card (M.redDim), localized title/body,
 * footer with a Retry button.
 */
export function ChatTurnErrorCard({ onRetry, reason, disabled }: ChatTurnErrorCardProps) {
  const t = useTranslations("Chat.turnError");

  return (
    <div className="chat-turn-error-card" role="alert">
      <div className="chat-turn-error-card__header">
        <svg
          width={17}
          height={17}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-metric-red, #f0506a)"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 16v-5M12 8h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
        </svg>
        <span className="chat-turn-error-card__title">{t("title")}</span>
      </div>
      <p className="chat-turn-error-card__body">{t("body")}</p>
      {reason === "reply_blocked" ? (
        <p className="chat-turn-error-card__body chat-turn-error-card__body--blocked">
          {t("bodyBlocked")}
        </p>
      ) : null}
      <div className="chat-turn-error-card__footer">
        <button
          type="button"
          className="chat-turn-error-card__btn chat-turn-error-card__btn--retry"
          onClick={onRetry}
          disabled={disabled}
        >
          {t("retry")}
        </button>
      </div>
    </div>
  );
}
