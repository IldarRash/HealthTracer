/**
 * suggested-quick-actions.ts — Pure derivation helper for LLM-turn quick actions.
 *
 * Derives which quick-action chips to surface after a fan-out (LLM) turn based
 * on the selected domains and the configured action definitions.
 *
 * Rules (from the product spec):
 * - Always include `today_summary_read`.
 * - Include `mark_today_workout_done` when "workout" is among the selected domains.
 * - Include `nutrition_plan_read` when "nutrition" is among the selected domains.
 * - Do NOT attach quick actions on pre-AI gate turns or turnError turns
 *   (the caller is responsible for not calling this helper in those cases).
 */

import type { QuickActionConfig, SuggestedQuickActionsConfig } from "./ai-behavior-config.js";
import type { SuggestedQuickAction } from "./chat-turn.js";
import type { DirectChatPathKind } from "./direct-chat-path.js";

export type FanOutDomain = "workout" | "nutrition" | "health";

export interface DeriveQuickActionsInput {
  /** Router-selected domains for this fan-out turn. */
  selectedDomains: readonly FanOutDomain[];
  /** Config-driven action definitions (from ai-behavior.json suggestedQuickActions). */
  quickActionsConfig: SuggestedQuickActionsConfig;
}

/**
 * Returns the quick-action chips to attach to an LLM-backed turn response.
 * Returns an empty array when the input config has no matching actions.
 *
 * This function is pure — it never throws and never reads from the database.
 */
export function deriveQuickActionsForTurn(
  input: DeriveQuickActionsInput,
): SuggestedQuickAction[] {
  const { selectedDomains, quickActionsConfig } = input;
  const domainSet = new Set<FanOutDomain>(selectedDomains);

  const eligibleIds = new Set<DirectChatPathKind>();
  eligibleIds.add("today_summary_read");

  if (domainSet.has("workout")) {
    eligibleIds.add("mark_today_workout_done");
  }

  if (domainSet.has("nutrition")) {
    eligibleIds.add("nutrition_plan_read");
  }

  const result: SuggestedQuickAction[] = [];

  for (const action of quickActionsConfig.actions) {
    if (eligibleIds.has(action.id)) {
      result.push(actionConfigToQuickAction(action));
    }
  }

  return result;
}

function actionConfigToQuickAction(action: QuickActionConfig): SuggestedQuickAction {
  return {
    id: action.id,
    labelEn: action.labelEn,
    labelRu: action.labelRu,
    messageText: {
      en: action.messageText.en,
      ru: action.messageText.ru,
    },
  };
}
