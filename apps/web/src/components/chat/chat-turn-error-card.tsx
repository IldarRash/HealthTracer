"use client";

import { useTranslations } from "next-intl";

type ChatTurnErrorCardProps = {
  /** Called when the user clicks Retry — resends the preceding user message. */
  onRetry: () => void;
  /** Called when user clicks Edit request — prefills the composer with the failed text. Omitted for turnError variant. */
  onEditRequest?: () => void;
  /**
   * When set, renders the honest turn-error variant (Chat.turnError.*) instead of
   * the legacy degraded-turn variant (Chat.error.*).
   *
   * reason="decision_failed" — generic pipeline failure, no extra body line.
   * reason="reply_blocked" — safety-blocked reply, adds a second body line.
   */
  reason?: "decision_failed" | "reply_blocked";
  /** Disable the retry button while a send is in flight. */
  disabled?: boolean;
};

/**
 * Error card rendered in place of the coach reply text when a turn fails.
 *
 * Two variants:
 *  - Legacy degraded-turn (no reason prop): uses Chat.error.* keys with Edit request button.
 *  - Honest turn-error (reason prop set): uses Chat.turnError.* keys, Retry only.
 *
 * Design: coach avatar row + red-tinted card (M.redDim), localized title/body,
 * footer with Retry (and optionally Edit request) buttons.
 */
export function ChatTurnErrorCard({ onRetry, onEditRequest, reason, disabled }: ChatTurnErrorCardProps) {
  const tError = useTranslations("Chat.error");
  const tTurnError = useTranslations("Chat.turnError");

  const isTurnError = reason !== undefined;

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
        <span className="chat-turn-error-card__title">
          {isTurnError ? tTurnError("title") : tError("title")}
        </span>
      </div>
      <p className="chat-turn-error-card__body">
        {isTurnError ? tTurnError("body") : tError("body")}
      </p>
      {isTurnError && reason === "reply_blocked" ? (
        <p className="chat-turn-error-card__body chat-turn-error-card__body--blocked">
          {tTurnError("bodyBlocked")}
        </p>
      ) : null}
      <div className="chat-turn-error-card__footer">
        <button
          type="button"
          className="chat-turn-error-card__btn chat-turn-error-card__btn--retry"
          onClick={onRetry}
          disabled={disabled}
        >
          {isTurnError ? tTurnError("retry") : tError("retry")}
        </button>
        {!isTurnError && onEditRequest ? (
          <button
            type="button"
            className="chat-turn-error-card__btn chat-turn-error-card__btn--edit"
            onClick={onEditRequest}
          >
            {tError("editRequest")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
