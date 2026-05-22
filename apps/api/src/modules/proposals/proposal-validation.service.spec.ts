import { describe, expect, it } from "vitest";
import { ProposalValidationService } from "./proposal-validation.service.js";

describe("ProposalValidationService", () => {
  const service = new ProposalValidationService();

  it("validates workout proposal payloads by intent", () => {
    const result = service.validateStoredProposal("create_workout_plan", {
      title: "Strength base",
      summary: "Three repeatable training days.",
      days: [{ day: "Day 1", focus: "Strength" }],
    });

    expect(result.valid).toBe(true);
  });

  it("validates adapt_workout_plan payloads with the workout schema", () => {
    const result = service.validateStoredProposal("adapt_workout_plan", {
      title: "Strength base",
      summary: "Reduced volume for recovery.",
      days: [{ day: "Day 1", focus: "Strength", exercises: ["Squat"] }],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects workout proposals without training days", () => {
    const result = service.validateStoredProposal("create_workout_plan", {
      title: "Strength base",
      summary: "Missing days.",
      days: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects malformed goal update payloads", () => {
    const result = service.validateStoredProposal("update_goal", {
      goalId: "not-a-uuid",
      changes: {},
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validates nutrition and today payloads by intent", () => {
    expect(
      service.validateStoredProposal("create_nutrition_plan", {
        title: "Balanced base",
        summary: "Moderate macros and hydration.",
        caloriesPerDay: 2200,
        proteinGrams: 140,
        carbsGrams: 220,
        fatGrams: 70,
        hydrationLiters: 2.5,
        notes: [],
      }).valid,
    ).toBe(true);

    expect(
      service.validateStoredProposal("create_today_checklist", {
        date: "2026-05-22",
        items: [{ label: "Drink water", kind: "hydration" }],
      }).valid,
    ).toBe(true);
  });

  it("allows summarize_progress without domain payload schema", () => {
    const result = service.validateStoredProposal("summarize_progress", {});

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects raw proposals with unsupported intents", () => {
    const result = service.validateRawProposal({
      intent: "diagnose_condition" as never,
      targetDomain: "general",
      title: "Unsafe",
      reason: "Unsafe",
      proposedChanges: {},
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
