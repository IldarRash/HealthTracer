/**
 * Tests for logWorkoutActivityProposalPayloadSchema and getLogWorkoutActivityDomainErrors.
 * Part B — performed log (ad-hoc workouts).
 */

import { describe, expect, it } from "vitest";
import {
  logWorkoutActivityProposalPayloadSchema,
  getLogWorkoutActivityDomainErrors,
} from "./workouts.js";

// ---------------------------------------------------------------------------
// logWorkoutActivityProposalPayloadSchema — valid payloads
// ---------------------------------------------------------------------------

describe("logWorkoutActivityProposalPayloadSchema — valid payloads", () => {
  const validBase = {
    activityType: "volleyball",
    title: "Volleyball session",
    durationMinutes: 90,
    performedAt: "2026-06-04T16:00:00.000Z",
  };

  it("accepts a payload with estimatedCalories only", () => {
    const result = logWorkoutActivityProposalPayloadSchema.safeParse({
      ...validBase,
      estimatedCalories: 450,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estimatedCalories).toBe(450);
      expect(result.data.ratePerHour).toBeUndefined();
    }
  });

  it("accepts a payload with ratePerHour only", () => {
    const result = logWorkoutActivityProposalPayloadSchema.safeParse({
      ...validBase,
      ratePerHour: 300,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ratePerHour).toBe(300);
      expect(result.data.estimatedCalories).toBeUndefined();
    }
  });

  it("accepts a payload with both estimatedCalories and ratePerHour", () => {
    const result = logWorkoutActivityProposalPayloadSchema.safeParse({
      ...validBase,
      estimatedCalories: 450,
      ratePerHour: 300,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estimatedCalories).toBe(450);
      expect(result.data.ratePerHour).toBe(300);
    }
  });

  it("accepts optional intensity field", () => {
    const result = logWorkoutActivityProposalPayloadSchema.safeParse({
      ...validBase,
      estimatedCalories: 350,
      intensity: "moderate",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intensity).toBe("moderate");
    }
  });

  it("accepts durationMinutes at maximum boundary (600)", () => {
    const result = logWorkoutActivityProposalPayloadSchema.safeParse({
      ...validBase,
      durationMinutes: 600,
      estimatedCalories: 1000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts ratePerHour at maximum boundary (3000)", () => {
    const result = logWorkoutActivityProposalPayloadSchema.safeParse({
      ...validBase,
      ratePerHour: 3000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts estimatedCalories at maximum boundary (20000)", () => {
    const result = logWorkoutActivityProposalPayloadSchema.safeParse({
      ...validBase,
      estimatedCalories: 20000,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// logWorkoutActivityProposalPayloadSchema — invalid / boundary violations
// ---------------------------------------------------------------------------

describe("logWorkoutActivityProposalPayloadSchema — invalid payloads", () => {
  const validBase = {
    activityType: "volleyball",
    title: "Volleyball session",
    durationMinutes: 90,
    performedAt: "2026-06-04T16:00:00.000Z",
  };

  it("rejects a payload with neither estimatedCalories nor ratePerHour (refine)", () => {
    const result = logWorkoutActivityProposalPayloadSchema.safeParse(validBase);
    // The .refine() check must reject when both fields are absent
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("estimatedCalories or ratePerHour must be provided"))).toBe(true);
    }
  });

  it("rejects durationMinutes exceeding 600", () => {
    const result = logWorkoutActivityProposalPayloadSchema.safeParse({
      ...validBase,
      durationMinutes: 601,
      estimatedCalories: 500,
    });
    expect(result.success).toBe(false);
  });

  it("rejects ratePerHour exceeding 3000", () => {
    const result = logWorkoutActivityProposalPayloadSchema.safeParse({
      ...validBase,
      ratePerHour: 3001,
    });
    expect(result.success).toBe(false);
  });

  it("rejects estimatedCalories exceeding 20000", () => {
    const result = logWorkoutActivityProposalPayloadSchema.safeParse({
      ...validBase,
      estimatedCalories: 20001,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative estimatedCalories", () => {
    const result = logWorkoutActivityProposalPayloadSchema.safeParse({
      ...validBase,
      estimatedCalories: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects ratePerHour of 0 (must be positive)", () => {
    const result = logWorkoutActivityProposalPayloadSchema.safeParse({
      ...validBase,
      ratePerHour: 0,
    });
    expect(result.success).toBe(false);
  });

  it("accepts non-integer durationMinutes and rounds them (LLM tolerance)", () => {
    // LLMs emit decimals for integer fields; the schema now rounds instead of failing.
    const result = logWorkoutActivityProposalPayloadSchema.safeParse({
      ...validBase,
      durationMinutes: 90.5,
      estimatedCalories: 300,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.durationMinutes).toBe(91);
    }
  });

  it("rejects unknown extra fields (.strict())", () => {
    const result = logWorkoutActivityProposalPayloadSchema.safeParse({
      ...validBase,
      estimatedCalories: 300,
      unknownField: "should not be allowed",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getLogWorkoutActivityDomainErrors
// ---------------------------------------------------------------------------

describe("getLogWorkoutActivityDomainErrors", () => {
  function makePayload(overrides: Record<string, unknown> = {}) {
    return logWorkoutActivityProposalPayloadSchema.parse({
      activityType: "volleyball",
      title: "Volleyball session",
      durationMinutes: 90,
      performedAt: "2026-06-04T16:00:00.000Z",
      estimatedCalories: 450,
      ...overrides,
    });
  }

  it("returns no errors for a valid payload", () => {
    expect(getLogWorkoutActivityDomainErrors(makePayload())).toEqual([]);
  });

  it("returns no errors for a payload with only ratePerHour (no estimatedCalories)", () => {
    const payload = logWorkoutActivityProposalPayloadSchema.parse({
      activityType: "volleyball",
      title: "Volleyball session",
      durationMinutes: 90,
      performedAt: "2026-06-04T16:00:00.000Z",
      ratePerHour: 300,
    });
    expect(getLogWorkoutActivityDomainErrors(payload)).toEqual([]);
  });

  it("rejects unsafe medical wording in activityType — diagnosis", () => {
    const errors = getLogWorkoutActivityDomainErrors(
      makePayload({ activityType: "rehabilitation protocol for my disorder" }),
    );
    expect(errors.some((e) => e.includes("diagnosis, treatment, or other unsupported medical"))).toBe(true);
  });

  it("rejects unsafe medical wording in title — treatment", () => {
    const errors = getLogWorkoutActivityDomainErrors(
      makePayload({ title: "Treatment exercises for my symptom" }),
    );
    expect(errors.some((e) => e.includes("diagnosis, treatment, or other unsupported medical"))).toBe(true);
  });

  it("rejects unsafe medical wording — disorder keyword", () => {
    const errors = getLogWorkoutActivityDomainErrors(
      makePayload({ activityType: "disorder management exercise" }),
    );
    expect(errors.some((e) => e.includes("diagnosis, treatment, or other unsupported medical"))).toBe(true);
  });

  it("rejects unsafe medical wording — medication keyword", () => {
    const errors = getLogWorkoutActivityDomainErrors(
      makePayload({ title: "Post-medication recovery walk" }),
    );
    expect(errors.some((e) => e.includes("diagnosis, treatment, or other unsupported medical"))).toBe(true);
  });

  it("does not flag normal fitness vocabulary", () => {
    const payload = makePayload({
      activityType: "strength training",
      title: "Leg day — squats and lunges",
    });
    expect(getLogWorkoutActivityDomainErrors(payload)).toEqual([]);
  });

  it("flags computed kcal exceeding 20 000 (ratePerHour × durationMinutes / 60)", () => {
    // 3000 kcal/hr × 600 min / 60 = 30 000 kcal — exceeds 20 000
    const payload = logWorkoutActivityProposalPayloadSchema.parse({
      activityType: "ultra marathon",
      title: "Ultra marathon 10h",
      durationMinutes: 600,
      performedAt: "2026-06-04T08:00:00.000Z",
      ratePerHour: 3000,
    });
    const errors = getLogWorkoutActivityDomainErrors(payload);
    expect(errors.some((e) => e.includes("Computed calorie estimate"))).toBe(true);
    expect(errors.some((e) => e.includes("exceeds 20 000 kcal"))).toBe(true);
  });

  it("does not flag the computed kcal limit when the estimate is within bounds", () => {
    // 300 kcal/hr × 90 min / 60 = 450 kcal — well within 20 000
    const payload = makePayload({ ratePerHour: 300, durationMinutes: 90 });
    const errors = getLogWorkoutActivityDomainErrors(payload);
    expect(errors.filter((e) => e.includes("exceeds 20 000"))).toHaveLength(0);
  });

  it("only checks ratePerHour-based kcal when ratePerHour is present", () => {
    // estimatedCalories=19000 is valid (within schema max 20000); no ratePerHour
    const payload = makePayload({ estimatedCalories: 19000 });
    // No ratePerHour — the computed-kcal check is skipped
    const errors = getLogWorkoutActivityDomainErrors(payload);
    expect(errors.filter((e) => e.includes("exceeds 20 000"))).toHaveLength(0);
  });
});
