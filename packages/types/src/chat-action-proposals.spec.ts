import { describe, expect, it } from "vitest";
import {
  buildWellbeingCheckinProposal,
  buildTextEstimateNutritionIncidentProposal,
  buildRecipeRecommendationProposal,
  captureWellbeingCheckinProposalPayloadSchema,
  getWellbeingCheckinProposalDomainErrors,
  mergeDeterministicChatProposals,
  shouldTriggerNutritionIncidentProposal,
  shouldTriggerRecipeRecommendationRequest,
  shouldTriggerWellbeingCheckinProposal,
} from "./chat-action-proposals.js";
import { rawAiProposalSchema } from "./index.js";

describe("chat action proposal triggers", () => {
  it("triggers wellbeing check-in when low mood is reported and today check-in is missing", () => {
    expect(shouldTriggerWellbeingCheckinProposal("I feel bad today", false)).toBe(true);
    expect(shouldTriggerWellbeingCheckinProposal("I feel bad today", true)).toBe(false);
  });

  it("does not trigger wellbeing check-in for crisis language", () => {
    expect(shouldTriggerWellbeingCheckinProposal("I want to die", false)).toBe(false);
  });

  it("triggers nutrition incident detection for cheat meal phrases", () => {
    expect(shouldTriggerNutritionIncidentProposal("I had a cheat meal tonight")).toBe(true);
    expect(shouldTriggerNutritionIncidentProposal("How is my workout plan?")).toBe(false);
  });

  it("triggers recipe recommendation requests for meal idea phrases", () => {
    expect(shouldTriggerRecipeRecommendationRequest("Can you suggest some dinner ideas?")).toBe(
      true,
    );
    expect(shouldTriggerRecipeRecommendationRequest("I had a cheat meal tonight")).toBe(false);
    expect(shouldTriggerRecipeRecommendationRequest("How is my workout plan?")).toBe(false);
  });

  it("merges deterministic proposals without duplicating intents", () => {
    const wellbeingMerged = mergeDeterministicChatProposals({
      userMessage: "I feel bad today",
      todayIsoDate: "2026-05-26",
      hasTodayWellbeingCheckIn: false,
      aiProposals: [],
    });

    expect(wellbeingMerged.map((proposal) => proposal.intent)).toEqual([
      "capture_wellbeing_checkin",
    ]);

    const nutritionMerged = mergeDeterministicChatProposals({
      userMessage: "I had a cheat meal",
      todayIsoDate: "2026-05-26",
      hasTodayWellbeingCheckIn: false,
      aiProposals: [],
      now: new Date("2026-05-26T18:00:00.000Z"),
    });

    expect(nutritionMerged.map((proposal) => proposal.intent)).toEqual([
      "log_nutrition_incident",
    ]);

    expect(
      [...wellbeingMerged, ...nutritionMerged].every((proposal) =>
        rawAiProposalSchema.safeParse(proposal as never).success,
      ),
    ).toBe(true);
  });

  it("keeps crisis turns free of deterministic proposals", () => {
    const merged = mergeDeterministicChatProposals({
      userMessage: "I feel bad and want to die",
      todayIsoDate: "2026-05-26",
      hasTodayWellbeingCheckIn: false,
      aiProposals: [],
    });

    expect(merged).toEqual([]);
  });

  it("builds bounded wellbeing and nutrition proposal payloads", () => {
    expect(buildWellbeingCheckinProposal("2026-05-26").proposedChanges).toMatchObject({
      date: "2026-05-26",
      moodScore: 2,
      stressScore: 3,
    });

    expect(
      buildTextEstimateNutritionIncidentProposal("2026-05-26T18:00:00.000Z").proposedChanges,
    ).toMatchObject({
      confidence: "medium",
      provenance: { source: "text_estimate" },
    });

    expect(
      buildRecipeRecommendationProposal({
        relatedNutritionPlanRevisionId: "ad000002-0000-4000-8000-000000000001",
        recommendations: [
          {
            recipeId: "a1000001-0000-4000-8000-000000000001",
            reason: "Fits your plan.",
            fitSummary: "Estimated macros fit.",
          },
        ],
      }).intent,
    ).toBe("recommend_recipes");
  });

  it("rejects out-of-range wellbeing proposal payload fields", () => {
    expect(
      captureWellbeingCheckinProposalPayloadSchema.safeParse({
        date: "2026-05-26",
        moodScore: 0,
        stressScore: 3,
      }).success,
    ).toBe(false);

    expect(
      captureWellbeingCheckinProposalPayloadSchema.safeParse({
        date: "2026-05-26",
        moodScore: 2,
        stressScore: 3,
        note: "x".repeat(281),
      }).success,
    ).toBe(false);

    expect(
      captureWellbeingCheckinProposalPayloadSchema.safeParse({
        date: "2026-05-26",
        moodScore: 2,
        stressScore: 3,
        rawNoteForAi: "do not accept",
      }).success,
    ).toBe(false);
  });

  it("validates wellbeing check-in domain rules for date and crisis flags", () => {
    const payload = captureWellbeingCheckinProposalPayloadSchema.parse({
      date: "2026-05-26",
      moodScore: 2,
      stressScore: 3,
    });

    expect(getWellbeingCheckinProposalDomainErrors(payload, "2026-05-26")).toEqual([]);
    expect(getWellbeingCheckinProposalDomainErrors(payload, "2026-05-25")).toEqual([
      "proposedChanges.date: Wellbeing check-in date must match the user's current day.",
    ]);
    expect(
      getWellbeingCheckinProposalDomainErrors(
        {
          ...payload,
          safetyFlags: ["keyword_match"],
        },
        "2026-05-26",
      ),
    ).toEqual([
      "proposedChanges.safetyFlags: Crisis keyword flags cannot be set through chat proposals.",
    ]);
    expect(
      getWellbeingCheckinProposalDomainErrors(payload, "2026-05-26", {
        existingCheckInId: "checkin-1",
      }),
    ).toEqual([
      "proposedChanges.date: A wellbeing check-in already exists for this day and cannot be overwritten by a stale proposal.",
    ]);
    expect(
      getWellbeingCheckinProposalDomainErrors(payload, "2026-05-26", {
        existingCheckInId: "checkin-1",
        appliedReference: "wellbeing_checkin:checkin-1",
      }),
    ).toEqual([]);
  });

  it("does not trigger nutrition incidents for crisis language", () => {
    expect(shouldTriggerNutritionIncidentProposal("I had a cheat meal and want to die")).toBe(
      false,
    );
  });

  it("does not trigger wellbeing check-in when hunger phrasing is present", () => {
    expect(shouldTriggerWellbeingCheckinProposal("I feel bad and hungry", false)).toBe(false);
  });

  it("parses raw AI proposals for wellbeing and nutrition incident intents", () => {
    expect(
      rawAiProposalSchema.parse({
        intent: "capture_wellbeing_checkin",
        targetDomain: "general",
        title: "Wellbeing check-in",
        reason: "You mentioned feeling off today.",
        proposedChanges: buildWellbeingCheckinProposal("2026-05-26").proposedChanges,
      }).intent,
    ).toBe("capture_wellbeing_checkin");

    expect(
      rawAiProposalSchema.parse({
        intent: "log_nutrition_incident",
        targetDomain: "nutrition",
        title: "Log nutrition incident",
        reason: "Review this estimate before confirming.",
        proposedChanges: buildTextEstimateNutritionIncidentProposal("2026-05-26T18:00:00.000Z")
          .proposedChanges,
      }).intent,
    ).toBe("log_nutrition_incident");
  });
});
