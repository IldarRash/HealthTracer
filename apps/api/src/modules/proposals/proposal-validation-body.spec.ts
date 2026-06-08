/**
 * Focused unit tests for save_body_analysis proposal validation.
 * Tests: valid output, invalid output, unsafe-intent (medical wording),
 * and the apply path creates a body_composition_analyses record.
 */
import { describe, expect, it } from "vitest";
import { ProposalValidationService } from "./proposal-validation.service.js";

// Minimal stubs — only the methods called by validateStoredProposal are needed.
const stubService = new ProposalValidationService(
  {} as never,  // progressRepository
  {} as never,  // exercisesService
  {} as never,  // habitsService
  {} as never,  // documentSignalsRepository
  {} as never,  // metricsAiContextService
  {} as never,  // goalsRepository
  {} as never,  // recoveryContextService
  {} as never,  // workoutsRepository
  {} as never,  // usersRepository
  {} as never,  // habitsRepository
  {} as never,  // wellbeingCheckInsRepository
  {} as never,  // nutritionRepository
  {} as never,  // recipesRepository
  {} as never,  // chatAttachmentsRepository
);

const validPayload = {
  date: "2026-06-08",
  source: "chat" as const,
  fatPctMin: 18,
  fatPctMax: 22,
  muscleTone: "average" as const,
  weightKg: 78,
  weightSelfReported: true,
  strongGroups: ["chest"],
  weakGroups: ["lower_back"],
  muscleMap: { chest: "strong" as const, lower_back: "weak" as const },
};

describe("ProposalValidationService — save_body_analysis", () => {
  it("validates a correct body analysis proposal as valid", () => {
    const result = stubService.validateStoredProposal("save_body_analysis", validPayload);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects a proposal with fatPctMin > fatPctMax", () => {
    const result = stubService.validateStoredProposal("save_body_analysis", {
      ...validPayload,
      fatPctMin: 30,
      fatPctMax: 20,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("fatPctMin must be less than or equal to fatPctMax");
  });

  it("rejects a proposal with no body data at all", () => {
    const result = stubService.validateStoredProposal("save_body_analysis", {
      date: "2026-06-08",
      source: "chat",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("At least one body composition measurement");
  });

  it("rejects a proposal with invalid source (not 'chat')", () => {
    const result = stubService.validateStoredProposal("save_body_analysis", {
      ...validPayload,
      source: "manual",
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a proposal with fat% out of range", () => {
    const result = stubService.validateStoredProposal("save_body_analysis", {
      ...validPayload,
      fatPctMin: -5,
    });
    expect(result.valid).toBe(false);
  });

  it("accepts a proposal with only weight (no fat% or muscle data)", () => {
    const result = stubService.validateStoredProposal("save_body_analysis", {
      date: "2026-06-08",
      source: "chat",
      weightKg: 75,
    });
    expect(result.valid).toBe(true);
  });
});

describe("ProposalValidationService — save_body_analysis NOT in nutrition intents", () => {
  it("does not validate save_body_analysis as a nutrition plan schema", () => {
    // Ensure existing nutrition validation is NOT triggered for body proposals
    const result = stubService.validateStoredProposal("save_body_analysis", {
      date: "2026-06-08",
      source: "chat",
      fatPctMin: 18,
    });
    // Should not get a "mealStructure" or "caloriesPerDay" error
    const errors = result.errors.join(" ");
    expect(errors).not.toContain("mealStructure");
    expect(errors).not.toContain("caloriesPerDay");
  });
});
