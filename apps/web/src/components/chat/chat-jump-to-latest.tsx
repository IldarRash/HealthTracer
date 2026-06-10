"use client";

import { useTranslations } from "next-intl";

type ChatJumpToLatestProps = {
  visible: boolean;
  onClick: () => void;
};

/**
 * Floating pill shown above the composer when the user has scrolled away from the bottom.
 * Clicking it smooth-scrolls back to the latest message.
 */
export function ChatJumpToLatest({ visible, onClick }: ChatJumpToLatestProps) {
  const t = useTranslations("Chat");

  if (!visible) {
    return null;
  }

  return (
    <div className="chat-jump-to-latest" aria-live="polite">
      <button
        type="button"
        className="chat-jump-to-latest__pill"
        onClick={onClick}
        aria-label={t("jumpToLatest")}
      >
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 9l7 7 7-7" />
        </svg>
        {t("jumpToLatest")}
      </button>
    </div>
  );
}
