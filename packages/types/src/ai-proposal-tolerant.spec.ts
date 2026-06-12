/**
 * ai-proposal-tolerant.spec.ts — Slice 5 contract behavior:
 *
 * aiProposalSchema is validation-status aware:
 *   - validationStatus "valid"  → per-intent proposedChanges check runs
 *     (valid-claim + bad payload FAILS parse — honesty floor)
 *   - "invalid" / "pending_validation" → no per-intent check; the raw LLM
 *     payload and validationErrors are preserved for the invalid card UI
 *
 * chatTurnResponseSchema.proposals is tolerant: one malformed proposal never
 * fails the whole turn response.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_REVISION_ORIGINAL_CHANGES_JSON_CHARS,
  aiProposalSchema,
  chatProposalRevisionSchema,
  isValidatedProposal,
  type AiProposal,
} from "./ai-proposal.js";
import { chatTurnResponseSchema } from "./chat-turn.js";

const VALID_WORKOUT_CHANGES = {
  title: "3-day strength block",
  summary: "Compound lifts three times a week.",
  days: [
    {
      weekday: "monday",
      focus: "Full body",
      exercises: [{ name: "Squat", sets: 3, reps: "5" }],
    },
  ],
};

/** The live scenario-2 shape: LLM payload that failed validation. */
const GARBAGE_CHANGES = {
  provenance: { source: "image_estimate" },
  imageRefs: ["aaaaaaaa-0000-4000-a000-00000000000f"],
  incidentDateTime: "2023-10-05",
};

function buildPersistedProposal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "14a08176-64a7-4a2d-8a44-581807368394",
    userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
    threadId: "24b19287-75b8-4a3e-9c10-691908479405",
    sourceMessageId: null,
    intent: "create_workout_plan",
    targetDomain: "workout",
    title: "New training plan",
    reason: "You asked for a structured week.",
    proposedChanges: VALID_WORKOUT_CHANGES,
    status: "pending",
    validationStatus: "valid",
    validationErrors: [],
    userDecisionAt: null,
    appliedReference: null,
    createdAt: "2026-06-12T12:00:00.000Z",
    updatedAt: "2026-06-12T12:00:00.000Z",
    ...overrides,
  };
}

describe("aiProposalSchema — validation-status-aware payload check", () => {
  it("parses a valid proposal and keeps it typed", () => {
    const result = aiProposalSchema.safeParse(buildPersistedProposal());

    expect(result.success).toBe(true);
    if (result.success && isValidatedProposal(result.data)) {
      expect(result.data.validationStatus).toBe("valid");
      expect(result.data.intent).toBe("create_workout_plan");
    } else {
      throw new Error("expected a validated proposal");
    }
  });

  it("still fails a proposal that CLAIMS valid but carries a bad payload (honesty floor)", () => {
    const result = aiProposalSchema.safeParse(
      buildPersistedProposal({
        intent: "log_nutrition_incident",
        targetDomain: "nutrition",
        proposedChanges: GARBAGE_CHANGES,
        validationStatus: "valid",
      }),
    );

    expect(result.success).toBe(false);
  });

  it("parses an invalid-status proposal with the raw payload and validationErrors intact", () => {
    const result = aiProposalSchema.safeParse(
      buildPersistedProposal({
        intent: "log_nutrition_incident",
        targetDomain: "nutrition",
        proposedChanges: GARBAGE_CHANGES,
        validationStatus: "invalid",
        validationErrors: [
          "proposedChanges.provenance.source: invalid enum value",
          "proposedChanges.imageRefs.0: expected object, received string",
        ],
      }),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.validationStatus).toBe("invalid");
      expect(result.data.proposedChanges).toEqual(GARBAGE_CHANGES);
      expect(result.data.validationErrors).toHaveLength(2);
      expect(isValidatedProposal(result.data)).toBe(false);
    }
  });

  it("parses a pending_validation proposal without the per-intent check", () => {
    const result = aiProposalSchema.safeParse(
      buildPersistedProposal({
        proposedChanges: { anything: "goes here until validated" },
        validationStatus: "pending_validation",
      }),
    );

    expect(result.success).toBe(true);
  });
});

describe("isValidatedProposal", () => {
  it("narrows only validationStatus=valid proposals", () => {
    const valid: AiProposal = aiProposalSchema.parse(buildPersistedProposal());
    const invalid: AiProposal = aiProposalSchema.parse(
      buildPersistedProposal({
        proposedChanges: GARBAGE_CHANGES,
        validationStatus: "invalid",
      }),
    );

    expect(isValidatedProposal(valid)).toBe(true);
    expect(isValidatedProposal(invalid)).toBe(false);
  });
});

describe("chatProposalRevisionSchema — relaxed originalProposal", () => {
  it("accepts an originalProposal whose proposedChanges never passed per-intent validation", () => {
    const result = chatProposalRevisionSchema.safeParse({
      supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
      originalProposal: {
        intent: "log_nutrition_incident",
        targetDomain: "nutrition",
        title: "Log your breakfast",
        reason: "You shared a food photo.",
        proposedChanges: GARBAGE_CHANGES,
      },
      modificationFeedback: "Please use today's date.",
    });

    expect(result.success).toBe(true);
  });

  it("still rejects unknown intents on the original proposal", () => {
    const result = chatProposalRevisionSchema.safeParse({
      supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
      originalProposal: {
        intent: "made_up_intent",
        targetDomain: "nutrition",
        title: "Log your breakfast",
        reason: "You shared a food photo.",
        proposedChanges: {},
      },
      modificationFeedback: "Please use today's date.",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an oversized proposedChanges payload (size cap on the opaque field)", () => {
    const oversized = {
      blob: "x".repeat(MAX_REVISION_ORIGINAL_CHANGES_JSON_CHARS + 1),
    };
    const result = chatProposalRevisionSchema.safeParse({
      supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
      originalProposal: {
        intent: "log_nutrition_incident",
        targetDomain: "nutrition",
        title: "Log your breakfast",
        reason: "You shared a food photo.",
        proposedChanges: oversized,
      },
      modificationFeedback: "Please use today's date.",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a normal-sized invalid-proposal payload under the size cap", () => {
    const underCap = {
      notes: "n".repeat(1_000),
      garbage: GARBAGE_CHANGES,
    };
    const result = chatProposalRevisionSchema.safeParse({
      supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
      originalProposal: {
        intent: "log_nutrition_incident",
        targetDomain: "nutrition",
        title: "Log your breakfast",
        reason: "You shared a food photo.",
        proposedChanges: underCap,
      },
      modificationFeedback: "Please use today's date.",
    });

    expect(result.success).toBe(true);
  });
});

describe("chatTurnResponseSchema — tolerant proposals array", () => {
  const thread = {
    id: "aaaaaaaa-0000-4000-a000-000000000001",
    userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
    title: "Coaching",
    createdAt: "2026-06-12T12:00:00.000Z",
    updatedAt: "2026-06-12T12:00:00.000Z",
  };
  const userMessage = {
    id: "aaaaaaaa-0000-4000-a000-000000000002",
    threadId: thread.id,
    role: "user",
    content: "Запиши мой завтрак",
    metadata: {},
    createdAt: "2026-06-12T12:00:00.000Z",
    attachments: [],
  };
  const assistantMessage = {
    ...userMessage,
    id: "aaaaaaaa-0000-4000-a000-000000000003",
    role: "assistant",
    content: "Logged a suggestion for you.",
  };

  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("parses a turn response embedding an invalid-status proposal", () => {
    const result = chatTurnResponseSchema.safeParse({
      thread,
      userMessage,
      assistantMessage,
      proposals: [
        buildPersistedProposal({
          threadId: thread.id,
          intent: "log_nutrition_incident",
          targetDomain: "nutrition",
          proposedChanges: GARBAGE_CHANGES,
          validationStatus: "invalid",
          validationErrors: ["proposedChanges: payload failed validation"],
        }),
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposals).toHaveLength(1);
      expect(result.data.proposals[0]?.validationStatus).toBe("invalid");
    }
  });

  it("drops only the unparseable proposal and keeps the rest of the turn", () => {
    const result = chatTurnResponseSchema.safeParse({
      thread,
      userMessage,
      assistantMessage,
      proposals: [
        { totally: "broken" },
        buildPersistedProposal({ threadId: thread.id }),
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proposals).toHaveLength(1);
      expect(result.data.proposals[0]?.intent).toBe("create_workout_plan");
    }
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain("chatTurn.proposal[0]");
  });
});
