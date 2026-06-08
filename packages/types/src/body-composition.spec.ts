import { describe, expect, it } from "vitest";
import {
  BODY_ANALYSIS_DISCLAIMER,
  getSaveBodyAnalysisDomainErrors,
  saveBodyAnalysisProposalPayloadSchema,
} from "./body-composition.js";
import { rawAiProposalSchema, proposalIntentSchema } from "./index.js";

describe("saveBodyAnalysisProposalPayloadSchema", () => {
  const validPayload = {
    date: "2026-06-08",
    source: "chat" as const,
    fatPctMin: 18,
    fatPctMax: 22,
    muscleTone: "average" as const,
    weightKg: 78,
    weightSelfReported: true,
    strongGroups: ["chest", "shoulders"],
    weakGroups: ["lower_back"],
    muscleMap: { chest: "strong" as const, lower_back: "weak" as const },
  };

  it("accepts a valid full payload", () => {
    const result = saveBodyAnalysisProposalPayloadSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("accepts a minimal payload (only fat% range)", () => {
    const result = saveBodyAnalysisProposalPayloadSchema.safeParse({
      date: "2026-06-08",
      source: "chat",
      fatPctMin: 20,
      fatPctMax: 25,
    });
    expect(result.success).toBe(true);
  });

  it("rejects source values other than 'chat'", () => {
    const result = saveBodyAnalysisProposalPayloadSchema.safeParse({
      ...validPayload,
      source: "api",
    });
    expect(result.success).toBe(false);
  });

  it("rejects fat% values outside 0–100", () => {
    const neg = saveBodyAnalysisProposalPayloadSchema.safeParse({
      ...validPayload,
      fatPctMin: -1,
    });
    expect(neg.success).toBe(false);

    const over = saveBodyAnalysisProposalPayloadSchema.safeParse({
      ...validPayload,
      fatPctMax: 101,
    });
    expect(over.success).toBe(false);
  });

  it("rejects invalid muscleTone values", () => {
    const result = saveBodyAnalysisProposalPayloadSchema.safeParse({
      ...validPayload,
      muscleTone: "excellent",
    });
    expect(result.success).toBe(false);
  });

  it("rejects excessive weight", () => {
    const result = saveBodyAnalysisProposalPayloadSchema.safeParse({
      ...validPayload,
      weightKg: 501,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid muscleMap tone values", () => {
    const result = saveBodyAnalysisProposalPayloadSchema.safeParse({
      ...validPayload,
      muscleMap: { chest: "excellent" },
    });
    expect(result.success).toBe(false);
  });

  it("defaults missing arrays to empty", () => {
    const result = saveBodyAnalysisProposalPayloadSchema.safeParse({
      date: "2026-06-08",
      source: "chat",
      fatPctMin: 20,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.strongGroups).toEqual([]);
      expect(result.data.weakGroups).toEqual([]);
      expect(result.data.muscleMap).toEqual({});
    }
  });
});

describe("getSaveBodyAnalysisDomainErrors", () => {
  it("returns no errors for a valid payload", () => {
    const payload = saveBodyAnalysisProposalPayloadSchema.parse({
      date: "2026-06-08",
      source: "chat",
      fatPctMin: 18,
      fatPctMax: 22,
      muscleTone: "average",
    });
    expect(getSaveBodyAnalysisDomainErrors(payload)).toEqual([]);
  });

  it("returns error when fatPctMin > fatPctMax", () => {
    const payload = saveBodyAnalysisProposalPayloadSchema.parse({
      date: "2026-06-08",
      source: "chat",
      fatPctMin: 25,
      fatPctMax: 20,
    });
    const errors = getSaveBodyAnalysisDomainErrors(payload);
    expect(errors).toContain(
      "body: fatPctMin must be less than or equal to fatPctMax.",
    );
  });

  it("returns error when no body data is present", () => {
    const payload = saveBodyAnalysisProposalPayloadSchema.parse({
      date: "2026-06-08",
      source: "chat",
    });
    const errors = getSaveBodyAnalysisDomainErrors(payload);
    expect(errors).toContain(
      "body: At least one body composition measurement is required (fat %, muscle tone, muscle map, or weight).",
    );
  });

  it("accepts payload with only weight and self-reported flag", () => {
    const payload = saveBodyAnalysisProposalPayloadSchema.parse({
      date: "2026-06-08",
      source: "chat",
      weightKg: 75,
    });
    expect(getSaveBodyAnalysisDomainErrors(payload)).toEqual([]);
  });

  it("accepts payload with only muscle map", () => {
    const payload = saveBodyAnalysisProposalPayloadSchema.parse({
      date: "2026-06-08",
      source: "chat",
      muscleMap: { chest: "strong" },
    });
    expect(getSaveBodyAnalysisDomainErrors(payload)).toEqual([]);
  });
});

describe("save_body_analysis proposal intent in proposalIntentSchema", () => {
  it("is a valid proposal intent", () => {
    const result = proposalIntentSchema.safeParse("save_body_analysis");
    expect(result.success).toBe(true);
  });
});

describe("rawAiProposalSchema with save_body_analysis intent", () => {
  const baseProposal = {
    intent: "save_body_analysis" as const,
    targetDomain: "body" as const,
    title: "Анализ тела",
    reason: "Визуальная оценка по трём фото.",
    proposedChanges: {
      date: "2026-06-08",
      source: "chat" as const,
      fatPctMin: 18,
      fatPctMax: 22,
      muscleTone: "average" as const,
      strongGroups: ["chest"],
      weakGroups: ["lower_back"],
      muscleMap: { chest: "strong" as const, lower_back: "weak" as const },
    },
  };

  it("accepts a valid save_body_analysis proposal", () => {
    const result = rawAiProposalSchema.safeParse(baseProposal);
    expect(result.success).toBe(true);
  });

  it("rejects a save_body_analysis proposal with empty source", () => {
    const result = rawAiProposalSchema.safeParse({
      ...baseProposal,
      proposedChanges: {
        ...baseProposal.proposedChanges,
        source: "manual",
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("BODY_ANALYSIS_DISCLAIMER", () => {
  it("is non-empty and wellness-framed (not medical)", () => {
    expect(BODY_ANALYSIS_DISCLAIMER.length).toBeGreaterThan(10);
    expect(BODY_ANALYSIS_DISCLAIMER).not.toMatch(/диагноз[^,]/);
    expect(BODY_ANALYSIS_DISCLAIMER).toContain("визуальная оценка");
  });
});
