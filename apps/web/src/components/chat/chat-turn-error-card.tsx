"use client";

import { useTranslations } from "next-intl";

type ChatTurnErrorCardProps = {
  /** Called when the user clicks Retry — resends the preceding user message. */
  onRetry: () => void;
  /** Called when user clicks Edit request — prefills the composer with the failed text. */
  onEditRequest: () => void;
};

/**
 * Degraded-turn error card rendered in place of the coach reply text
 * when a turn's metadata.turnDegraded is present.
 *
 * Design: coach avatar row + red-tinted card (M.redDim), localized title/body,
 * footer with Retry and Edit request buttons.
 */
export function ChatTurnErrorCard({ onRetry, onEditRequest }: ChatTurnErrorCardProps) {
  const t = useTranslations("Chat.error");

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
      <div className="chat-turn-error-card__footer">
        <button
          type="button"
          className="chat-turn-error-card__btn chat-turn-error-card__btn--retry"
          onClick={onRetry}
        >
          {t("retry")}
        </button>
        <button
          type="button"
          className="chat-turn-error-card__btn chat-turn-error-card__btn--edit"
          onClick={onEditRequest}
        >
          {t("editRequest")}
        </button>
      </div>
    </div>
  );
}
