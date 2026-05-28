import { describe, expect, it } from "vitest";
import { getCapabilityConfig } from "@health/types";
import type { AiStructuredOutput } from "@health/types";
import {
  ActionResolverService,
  type CoachDirectActionAttempt,
} from "./action-resolver.service.js";

const WORKOUT_PROPOSAL = {
  intent: "adapt_workout_plan" as const,
  targetDomain: "workout" as const,
  title: "Reduce today's load",
  reason: "Recovery signals are low.",
  proposedChanges: {
    title: "Strength base",
    summary: "Lighter session today.",
    days: [{ day: "Day 1", focus: "Recovery", exercises: ["Walk"] }],
    notes: [],
  },
};

const NUTRITION_PROPOSAL = {
  intent: "log_nutrition_incident" as const,
  targetDomain: "nutrition" as const,
  title: "Log post-workout meal",
  reason: "Nutrition logging is outside this workout turn.",
  proposedChanges: {
    incidentDateTime: "2026-05-26T18:00:00.000Z",
    items: [{ name: "Protein shake", quantity: "1 serving", calories: 220 }],
    estimatedCalories: 220,
    estimatedMacros: { proteinGrams: 30, carbsGrams: 10, fatGrams: 4 },
    confidence: "medium" as const,
    provenance: { source: "text_estimate" as const, providerId: "chat_trigger" },
    imageRefs: [],
  },
};

describe("ActionResolverService", () => {
  const service = new ActionResolverService();

  function resolveForCapability(
    capabilityId: "adjust_workout",
    output: AiStructuredOutput,
    directActions?: readonly CoachDirectActionAttempt[],
  ) {
    const config = getCapabilityConfig(capabilityId);

    return service.resolveProposalOnlyOutput({
      output,
      catalogIntentId: capabilityId,
      allowedProposalIntents: config.allowedProposals,
      directActions,
    });
  }

  it("passes allowed proposals through unchanged", () => {
    const output: AiStructuredOutput = {
      reply: "Here is a lighter workout option you can review.",
      proposals: [WORKOUT_PROPOSAL],
    };

    const resolved = resolveForCapability("adjust_workout", output);

    expect(resolved).toEqual(output);
  });

  it("filters proposals outside the capability allowlist", () => {
    const resolved = resolveForCapability("adjust_workout", {
      reply: "Here is a lighter workout option you can review.",
      proposals: [WORKOUT_PROPOSAL, NUTRITION_PROPOSAL],
    });

    expect(resolved.proposals).toHaveLength(1);
    expect(resolved.proposals[0]?.intent).toBe("adapt_workout_plan");
    expect(resolved.reply).toBe("Here is a lighter workout option you can review.");
  });

  it("blocks all proposals when the capability allowlist is empty", () => {
    const resolved = service.resolveProposalOnlyOutput({
      output: {
        reply: "I can summarize what I see without changing your plans.",
        proposals: [NUTRITION_PROPOSAL],
      },
      catalogIntentId: "attachment_medical_document",
      allowedProposalIntents: getCapabilityConfig("attachment_medical_document").allowedProposals,
    });

    expect(resolved.proposals).toEqual([]);
  });

  it("blocks proposals on proposal explainer turns", () => {
    const resolved = service.resolveProposalOnlyOutput({
      output: {
        reply: "I suggested this because your recovery signals were low.",
        proposals: [WORKOUT_PROPOSAL],
      },
      catalogIntentId: "proposal_explainer",
      allowedProposalIntents: getCapabilityConfig("proposal_explainer").allowedProposals,
    });

    expect(resolved.proposals).toEqual([]);
    expect(resolved.reply).toContain("recovery signals");
  });

  it("ignores direct actions and returns proposal-only structured output", () => {
    const resolved = resolveForCapability(
      "adjust_workout",
      {
        reply: "Marked complete.",
        proposals: [WORKOUT_PROPOSAL],
      },
      [{ type: "mark_today_workout_done", payload: { sessionId: "session-1" } }],
    );

    expect(resolved).toEqual({
      reply: "Marked complete.",
      proposals: [WORKOUT_PROPOSAL],
    });
  });

  it("does not mutate the input proposal array", () => {
    const proposals = [WORKOUT_PROPOSAL, NUTRITION_PROPOSAL];
    const output: AiStructuredOutput = {
      reply: "Review options.",
      proposals,
    };

    resolveForCapability("adjust_workout", output);

    expect(output.proposals).toHaveLength(2);
  });
});
