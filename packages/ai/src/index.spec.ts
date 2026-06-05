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
});
