import { describe, expect, it, vi } from "vitest";
import { PROPOSAL_EXPLAINER_NO_PROPOSAL_REPLY } from "@health/types";
import { ProposalExplainerMatcherService } from "../ai/proposal-explainer-matcher.service.js";
import { createDefaultAiBehaviorConfigService } from "../ai/test-ai-behavior-fixtures.js";
import { ProposalExplainerService } from "./proposal-explainer.service.js";

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

const user = {
  id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  displayName: "Test User",
  email: "test@example.com",
  timezone: "UTC",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function createService(deps: {
  findLatestProposalForThread?: ReturnType<typeof vi.fn>;
}) {
  const aiBehaviorConfigService = createDefaultAiBehaviorConfigService();

  return new ProposalExplainerService(
    { findLatestProposalForThread: deps.findLatestProposalForThread ?? vi.fn() } as never,
    { resolveFromAuth: async () => user } as never,
    aiBehaviorConfigService,
    new ProposalExplainerMatcherService(aiBehaviorConfigService),
  );
}

describe("ProposalExplainerService", () => {
  it("returns not_explainer for normal advice questions", async () => {
    const service = createService({});

    const result = await service.resolvePreAiTurn({
      auth,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      userMessage: "Why should I train today?",
      hasAttachments: false,
      hasProposalRevision: false,
    });

    expect(result).toEqual({ kind: "not_explainer" });
  });

  it("returns no_proposal fallback when thread has no stored proposal", async () => {
    const findLatestProposalForThread = vi.fn().mockResolvedValue(null);
    const service = createService({ findLatestProposalForThread });

    const result = await service.resolvePreAiTurn({
      auth,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      userMessage: "Why this proposal?",
      hasAttachments: false,
      hasProposalRevision: false,
    });

    expect(findLatestProposalForThread).toHaveBeenCalledWith(
      user.id,
      "24b19287-75b8-4a3e-9c10-691908479405",
    );
    expect(result).toEqual({
      kind: "no_proposal",
      reply: PROPOSAL_EXPLAINER_NO_PROPOSAL_REPLY,
    });
  });

  it("returns bounded proposal context for explainer turns", async () => {
    const findLatestProposalForThread = vi.fn().mockResolvedValue({
      id: "a1000001-0000-4000-8000-000000000001",
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: "Lighten leg day",
      reason: "Recent poor sleep suggested a lighter session.",
      status: "pending",
      evidenceRefs: [{ domain: "wellbeing", label: "Poor sleep reported yesterday" }],
      createdAt: new Date("2026-05-27T10:00:00.000Z"),
    });
    const service = createService({ findLatestProposalForThread });

    const result = await service.resolvePreAiTurn({
      auth,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      userMessage: "Why did you suggest this change?",
      hasAttachments: false,
      hasProposalRevision: false,
    });

    expect(result.kind).toBe("with_proposal");
    if (result.kind === "with_proposal") {
      expect(result.context).toMatchObject({
        proposalId: "a1000001-0000-4000-8000-000000000001",
        title: "Lighten leg day",
        reason: "Recent poor sleep suggested a lighter session.",
        evidenceSummaries: [{ domain: "wellbeing", label: "Poor sleep reported yesterday" }],
      });
    }
  });
});
