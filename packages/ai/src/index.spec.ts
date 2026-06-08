import { describe, expect, it } from "vitest";
import {
  containsUnsafeDocumentSummaryLanguage,
  containsUnsafeMedicalLanguage,
  parseAiStructuredOutput,
  validateProposalSafety,
  validateReplySafety,
} from "./index.js";

describe("ai structured output", () => {
  it("parses valid coach output", () => {
    const result = parseAiStructuredOutput({
      reply: "Here is a suggestion to review.",
      proposals: [],
    });

    expect(result.ok).toBe(true);
  });

  it("rejects malformed coach output", () => {
    const result = parseAiStructuredOutput({
      reply: "",
      proposals: [],
    });

    expect(result.ok).toBe(false);
  });
});

describe("ai safety helpers", () => {
  it("flags diagnosis wording", () => {
    expect(
      containsUnsafeMedicalLanguage("This sounds like a clinical diagnosis."),
    ).toBe(true);
  });

  it("allows supported document type labels in document summary checks", () => {
    expect(
      containsUnsafeDocumentSummaryLanguage(
        "Governed summary for a user-provided provider note titled \"Follow-up\".",
      ),
    ).toBe(false);
    expect(
      containsUnsafeDocumentSummaryLanguage(
        "Governed summary for a user-provided med list titled \"Home list\".",
      ),
    ).toBe(false);
  });

  it("still blocks unsafe document summary wording", () => {
    expect(
      containsUnsafeDocumentSummaryLanguage(
        "This summary confirms a diagnosis and emergency dosing guidance.",
      ),
    ).toBe(true);
  });

  it("flags unsafe proposals and replies", () => {
    expect(
      validateProposalSafety({
        intent: "summarize_progress",
        targetDomain: "general",
        title: "Treatment plan",
        reason: "You should take medication for this.",
        proposedChanges: {},
      }),
    ).toHaveLength(1);

    expect(
      validateReplySafety("I can prescribe a treatment for your symptoms."),
    ).toHaveLength(1);
  });

  it("flags therapy and therapist wording", () => {
    expect(containsUnsafeMedicalLanguage("A therapist can help you process this.")).toBe(
      true,
    );
    expect(containsUnsafeMedicalLanguage("Try CBT exercises for anxiety.")).toBe(true);
    expect(containsUnsafeMedicalLanguage("This may indicate mental illness.")).toBe(true);
  });

  it("allows normal wellness wording without therapy blocks", () => {
    expect(
      containsUnsafeMedicalLanguage(
        "Your stress and motivation look lower this week, so recovery habits may help.",
      ),
    ).toBe(false);
    expect(validateReplySafety("Recovery and stress check-ins can guide wellness habits.")).toEqual(
      [],
    );
  });

  it("flags unsafe wording inside serialized proposed changes", () => {
    expect(
      validateProposalSafety({
        intent: "create_workout_plan",
        targetDomain: "workout",
        title: "Strength plan",
        reason: "Build consistency.",
        proposedChanges: {
          title: "Plan",
          summary: "Follow this clinical treatment protocol.",
          days: [{ day: "Day 1", focus: "Strength" }],
        },
      }),
    ).toHaveLength(1);
  });

  it("rejects save_body_analysis proposal whose reason contains unsafe medical wording", () => {
    // The body analysis is wellness/visual only — medical-certainty language in the
    // proposal reason must be flagged before the proposal can be accepted.
    const errors = validateProposalSafety({
      intent: "save_body_analysis",
      targetDomain: "body",
      title: "Анализ тела",
      reason: "This confirms a diagnosis of high body fat disorder.",
      proposedChanges: {
        date: "2026-06-08",
        source: "chat",
        fatPctMin: 28,
        fatPctMax: 32,
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts save_body_analysis proposal with wellness-only reason", () => {
    // A correctly framed body analysis proposal must pass safety validation.
    const errors = validateProposalSafety({
      intent: "save_body_analysis",
      targetDomain: "body",
      title: "Анализ тела",
      reason:
        "Примерная визуальная оценка по трём фото: жировая масса около 18–22%, тонус средний.",
      proposedChanges: {
        date: "2026-06-08",
        source: "chat",
        fatPctMin: 18,
        fatPctMax: 22,
        muscleTone: "average",
        strongGroups: ["chest"],
        weakGroups: ["lower_back"],
        muscleMap: { chest: "strong", lower_back: "weak" },
      },
    });
    expect(errors).toEqual([]);
  });

  it("rejects save_body_analysis proposal whose title contains diagnostic language", () => {
    const errors = validateProposalSafety({
      intent: "save_body_analysis",
      targetDomain: "body",
      title: "Metabolic disorder treatment plan",
      reason: "Visual assessment.",
      proposedChanges: {
        date: "2026-06-08",
        source: "chat",
        fatPctMin: 30,
        fatPctMax: 35,
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});
