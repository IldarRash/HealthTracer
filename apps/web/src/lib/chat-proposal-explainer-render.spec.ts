import { describe, expect, it } from "vitest";
import {
  resolveChatMessageCrisisSupport,
  resolveChatMessageWeeklyReview,
} from "./chat-ui-state.js";
import { resolveChatMessageDirectPathFeedback } from "./chat-direct-path-ui-state.js";

describe("chat proposal explainer render path", () => {
  const explainerContent =
    "I suggested this because your recovery signals were low and a lighter session keeps momentum without overload.";

  it("does not route no-proposal explainer replies through special assistant panels", () => {
    const message = {
      role: "assistant" as const,
      content: "No recent proposal to explain.",
      metadata: {
        proposalExplainer: {
          status: "no_proposal",
        },
      },
    };

    expect(resolveChatMessageCrisisSupport(message)).toBeNull();
    expect(resolveChatMessageWeeklyReview(message)).toBeNull();
    expect(resolveChatMessageDirectPathFeedback(message)).toBeNull();
  });

  it("does not route agent-turn explainer replies through special assistant panels", () => {
    const message = {
      role: "assistant" as const,
      content: explainerContent,
      metadata: {
        agent: {
          provider: "openai",
          intent: "proposal_explainer",
          catalogIntentId: "proposal_explainer",
          capabilityPresentation: {
            primaryCapabilityId: "proposal_explainer",
            selectedCapabilityIds: ["proposal_explainer"],
            compositionStrategy: "primary_only",
            widgetDescriptors: [],
            actionDescriptors: [],
          },
          purpose: "general_chat",
          depth: "small",
          timeRange: "7d",
          toolsInvoked: [],
          safety: {
            constraintsApplied: [],
            blockedProposalIntents: [],
            crisisBoundaryTriggered: false,
          },
          citations: [],
          missingContextNotes: [],
        },
      },
    };

    expect(resolveChatMessageCrisisSupport(message)).toBeNull();
    expect(resolveChatMessageWeeklyReview(message)).toBeNull();
    expect(resolveChatMessageDirectPathFeedback(message)).toBeNull();
    expect(message.content).toBe(explainerContent);
  });
});
