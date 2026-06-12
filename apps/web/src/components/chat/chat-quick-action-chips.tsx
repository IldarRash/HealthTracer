"use client";

import { useLocale, useTranslations } from "next-intl";
import type { SuggestedQuickAction } from "@health/types";
import { PromptChip, PromptChipList } from "../ui";

type ChatQuickActionChipsProps = {
  actions: readonly SuggestedQuickAction[];
  disabled?: boolean;
  onActionSelect: (messageText: string) => void;
};

/**
 * Renders localized quick-action chips below the latest assistant message.
 *
 * Clicking a chip sends the chip's localized messageText as a normal user message
 * via the chat send mutation — it hits a deterministic direct path and answers instantly.
 *
 * Only rendered under the LATEST assistant message when its persisted metadata
 * includes non-empty suggestedQuickActions (absent on turnError turns), so the
 * chips survive a thread reload.
 */
export function ChatQuickActionChips({
  actions,
  disabled,
  onActionSelect,
}: ChatQuickActionChipsProps) {
  const locale = useLocale();
  const t = useTranslations("Chat.quickActions");

  if (actions.length === 0) {
    return null;
  }

  return (
    <PromptChipList label={t("label")} className="chat-quick-actions">
      {actions.map((action) => {
        const label = locale === "ru" ? action.labelRu : action.labelEn;
        const messageText = locale === "ru" ? action.messageText.ru : action.messageText.en;

        return (
          <PromptChip
            key={action.id}
            aria-label={label}
            disabled={disabled}
            onClick={() => {
              onActionSelect(messageText);
            }}
          >
            {label}
          </PromptChip>
        );
      })}
    </PromptChipList>
  );
}
