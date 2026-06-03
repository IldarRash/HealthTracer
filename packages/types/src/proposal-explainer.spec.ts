import { describe, expect, it } from "vitest";
import {
  buildProposalExplainerTurnContext,
  detectProposalExplainerRequest,
  detectProposalExplainerRequestFromMessage,
} from "./proposal-explainer.js";

describe("proposal explainer detection", () => {
  it("detects explicit proposal explanation requests in English", () => {
    expect(detectProposalExplainerRequest("Why this proposal?")).toBe(true);
    expect(detectProposalExplainerRequest("Why did you suggest this change?")).toBe(true);
    expect(detectProposalExplainerRequest("Explain this proposal")).toBe(true);
  });

  it("detects explicit proposal explanation requests in Russian", () => {
    expect(detectProposalExplainerRequest("Почему ты предложил это?")).toBe(true);
    expect(detectProposalExplainerRequest("Объясни это предложение")).toBe(true);
  });

  it("does not hijack general advice questions", () => {
    expect(detectProposalExplainerRequest("Why should I train today?")).toBe(false);
    expect(detectProposalExplainerRequest("Why is protein important?")).toBe(false);
    expect(detectProposalExplainerRequest("Why do I feel tired?")).toBe(false);
    expect(detectProposalExplainerRequest("Почему мне нужно больше спать?")).toBe(false);
  });

  it("blocks attachment and proposal revision turns", () => {
    expect(
      detectProposalExplainerRequestFromMessage("Why this proposal?", {
        hasAttachments: true,
      }),
    ).toBe(false);
    expect(
      detectProposalExplainerRequestFromMessage("Why this proposal?", {
        hasProposalRevision: true,
      }),
    ).toBe(false);
  });

  it("builds bounded proposal explainer context without raw document content", () => {
    const context = buildProposalExplainerTurnContext({
      proposalId: "a1000001-0000-4000-8000-000000000001",
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: "Lighten leg day",
      reason: "Recent poor sleep and heavy leg load suggested a lighter session.",
      status: "pending",
      evidenceRefs: [
        { domain: "wellbeing", label: "Poor sleep reported yesterday" },
        { domain: "document", label: "Blood panel summary" },
      ],
      createdAt: "2026-05-27T10:00:00.000Z",
    });

    expect(context.evidenceSummaries).toEqual([
      { domain: "wellbeing", label: "Poor sleep reported yesterday" },
      { domain: "document", label: "Blood panel summary" },
    ]);
    expect(context.title).toBe("Lighten leg day");
  });
});
