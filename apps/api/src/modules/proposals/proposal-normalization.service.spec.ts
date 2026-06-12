import { describe, expect, it, vi } from "vitest";
import { ProposalNormalizationService } from "./proposal-normalization.service.js";
import type { ProposalNormalizationContext } from "./proposal-normalization.service.js";
import { ProposalValidationService } from "./proposal-validation.service.js";

const USER_ID = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const NOW_ISO = "2026-06-12T10:00:00.000Z";
const IMAGE_ATTACHMENT_ID = "aa345678-90ab-4cde-8f01-234567890abc";

function createContext(
  overrides: Partial<ProposalNormalizationContext> = {},
): ProposalNormalizationContext {
  return {
    userId: USER_ID,
    nowIso: NOW_ISO,
    turnAttachments: [],
    ...overrides,
  };
}

function createService(exercisesService: unknown = {}): ProposalNormalizationService {
  return new ProposalNormalizationService(exercisesService as never);
}

/** Bare validation service — validateStoredProposal is dependency-free. */
function createValidationService(): ProposalValidationService {
  const noop = {} as never;
  return new (ProposalValidationService as new (
    ...args: unknown[]
  ) => ProposalValidationService)(
    noop, noop, noop, noop, noop, noop, noop,
    noop, noop, noop, noop, noop, noop, noop,
  );
}

const CATALOG_EXERCISE = {
  id: "e1000001-0000-4000-8000-000000000001",
  name: "Pogo Jump",
  normalizedName: "pogo jump",
  aliases: [],
  primaryMuscles: ["calves"],
  secondaryMuscles: [],
  equipment: ["bodyweight"],
  movementPatterns: ["plyometric"],
  modalities: ["plyometrics"],
  difficulty: "intermediate",
  instructions: ["Jump."],
  safetyNotes: ["Land softly."],
  media: { refs: [], fallbackLabel: null },
  source: "system_seed",
  validationStatus: "validated",
  status: "active",
  userId: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const LEGACY_PAYLOAD = {
  title: "Plyometric plan",
  summary: "Short cardio burst.",
  days: [
    {
      weekday: "monday" as const,
      focus: "Cardio",
      exercises: [{ name: "Pogo Jump", reps: "20", sets: 2 }],
    },
  ],
  notes: [] as string[],
};

describe("ProposalNormalizationService — intent dispatch", () => {
  it("returns proposedChanges unchanged for intents without a normalizer", async () => {
    const svc = createService();
    const changes = { plan: {} };

    const result = await svc.normalizeProposal(
      "create_nutrition_plan",
      changes,
      createContext(),
    );

    expect(result).toBe(changes);
  });

  it("returns proposedChanges unchanged for capture_wellbeing_checkin (unknown-intent passthrough)", async () => {
    const svc = createService();
    const changes = { date: "2026-06-12", mood: 4 };

    const result = await svc.normalizeProposal(
      "capture_wellbeing_checkin",
      changes,
      createContext(),
    );

    expect(result).toBe(changes);
  });
});

describe("ProposalNormalizationService — workout-plan intents", () => {
  it("returns proposedChanges unchanged when it does not parse as WorkoutPlanProposalChanges", async () => {
    const svc = createService();
    const changes = { invalid: true };

    const result = await svc.normalizeProposal("create_workout_plan", changes, createContext());

    expect(result).toBe(changes);
  });

  it("returns proposedChanges by reference when no legacy entries exist", async () => {
    const svc = createService();
    const structured = {
      title: "Strength plan",
      summary: "No legacy entries.",
      days: [
        {
          weekday: "tuesday" as const,
          focus: "Strength",
          exercises: [
            {
              exerciseId: "e1000001-0000-4000-8000-000000000001",
              snapshot: { name: "Goblet Squat" },
              sets: 3,
              reps: "8",
            },
          ],
        },
      ],
      notes: [] as string[],
    };

    const result = await svc.normalizeProposal(
      "create_workout_plan",
      structured,
      createContext(),
    );

    expect(result).toBe(structured);
  });

  it("resolves legacy exercise to catalog exerciseId when found by normalized name", async () => {
    const svc = createService({
      findExerciseByNormalizedName: async () => CATALOG_EXERCISE,
    });

    const result = (await svc.normalizeProposal(
      "create_workout_plan",
      LEGACY_PAYLOAD,
      createContext(),
    )) as typeof LEGACY_PAYLOAD;

    const ex = result.days[0]?.exercises[0] as Record<string, unknown>;
    expect(ex.exerciseId).toBe(CATALOG_EXERCISE.id);
    expect((ex.snapshot as { name: string }).name).toBe("Pogo Jump");
    expect(ex.sets).toBe(2);
    expect(ex.reps).toBe("20");
  });

  it("resolves legacy exercise to pendingExerciseRef when not in catalog", async () => {
    const svc = createService({
      findExerciseByNormalizedName: async () => null,
    });

    const result = (await svc.normalizeProposal(
      "adapt_workout_plan",
      LEGACY_PAYLOAD,
      createContext(),
    )) as {
      days: Array<{ exercises: Array<Record<string, unknown>> }>;
      pendingExercises?: Record<string, unknown>;
    };

    const ex = result.days[0]?.exercises[0];
    expect(ex?.pendingExerciseRef).toBe("pogo-jump");
    expect(result.pendingExercises?.["pogo-jump"]).toMatchObject({
      name: "Pogo Jump",
      source: "ai_generated",
    });
  });

  it("after normalization the payload passes validateStoredProposal (catalog match)", async () => {
    const svc = createService({
      findExerciseByNormalizedName: async () => CATALOG_EXERCISE,
    });

    const normalized = await svc.normalizeProposal(
      "create_workout_plan",
      LEGACY_PAYLOAD,
      createContext(),
    );

    const validation = createValidationService().validateStoredProposal(
      "create_workout_plan",
      normalized,
    );
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it("after normalization the payload passes validateStoredProposal (pending ref path)", async () => {
    const svc = createService({
      findExerciseByNormalizedName: async () => null,
    });

    const normalized = await svc.normalizeProposal(
      "create_workout_plan",
      LEGACY_PAYLOAD,
      createContext(),
    );

    const validation = createValidationService().validateStoredProposal(
      "create_workout_plan",
      normalized,
    );
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });
});

describe("ProposalNormalizationService — log_nutrition_incident", () => {
  const RAW_NUTRITION_CHANGES = {
    incidentDateTime: "2023-10-05T08:00:00.000Z",
    items: [{ name: "Oatmeal with berries", calories: 320 }],
    estimatedCalories: 320,
    estimatedMacros: { proteinGrams: 12, carbsGrams: 55, fatGrams: 6 },
    confidence: "medium",
    provenance: { source: "image_estimate" },
    imageRefs: ["cc345678-90ab-4cde-8f01-234567890abc"],
  };

  it("stamps imageRefs/provenance/date from turn state using only image-MIME attachments", async () => {
    const svc = createService();

    const result = (await svc.normalizeProposal(
      "log_nutrition_incident",
      RAW_NUTRITION_CHANGES,
      createContext({
        turnAttachments: [
          { id: IMAGE_ATTACHMENT_ID, mimeType: "image/jpeg", category: "food_photo" },
          {
            id: "dd345678-90ab-4cde-8f01-234567890abc",
            mimeType: "application/pdf",
            category: "document_file",
          },
        ],
      }),
    )) as {
      imageRefs: unknown;
      provenance: { source: string };
      incidentDateTime: string;
    };

    // Only the image attachment is stamped — the PDF id must not appear.
    expect(result.imageRefs).toEqual([{ id: IMAGE_ATTACHMENT_ID }]);
    expect(result.provenance.source).toBe("vision_llm_estimate");
    expect(result.incidentDateTime).toBe(NOW_ISO);
  });

  it("treats a document-only turn as image-free (text_estimate, refs coerced not replaced)", async () => {
    const svc = createService();

    const result = (await svc.normalizeProposal(
      "log_nutrition_incident",
      RAW_NUTRITION_CHANGES,
      createContext({
        turnAttachments: [
          {
            id: "dd345678-90ab-4cde-8f01-234567890abc",
            mimeType: "application/pdf",
            category: "document_file",
          },
        ],
      }),
    )) as { imageRefs: unknown; provenance: { source: string } };

    expect(result.imageRefs).toEqual([{ id: "cc345678-90ab-4cde-8f01-234567890abc" }]);
    expect(result.provenance.source).toBe("text_estimate");
  });
});

describe("ProposalNormalizationService — fault isolation", () => {
  it("returns the original changes and warns without payload contents when a normalizer throws", async () => {
    const svc = createService();
    vi.spyOn(
      svc as unknown as { normalizeWorkoutPlanChanges: () => Promise<unknown> },
      "normalizeWorkoutPlanChanges",
    ).mockRejectedValue(new Error("normalizer exploded"));
    const warnSpy = vi
      .spyOn((svc as unknown as { logger: { warn: (...args: unknown[]) => void } }).logger, "warn")
      .mockImplementation(() => undefined);

    const changes = { ...LEGACY_PAYLOAD, secretMarker: "PRIVATE-PAYLOAD-CONTENT" };
    const result = await svc.normalizeProposal("create_workout_plan", changes, createContext());

    expect(result).toBe(changes);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Privacy floor: the warn call must carry intent + error NAME only —
    // never payload contents and never the raw error message (DB-driver
    // messages can embed payload values).
    const serializedWarnArgs = JSON.stringify(warnSpy.mock.calls[0]);
    expect(serializedWarnArgs).toContain("create_workout_plan");
    expect(serializedWarnArgs).toContain("Error");
    expect(serializedWarnArgs).not.toContain("normalizer exploded");
    expect(serializedWarnArgs).not.toContain("PRIVATE-PAYLOAD-CONTENT");
  });
});

describe("ProposalNormalizationService — adapt_workout_plan_from_progress", () => {
  it("bridges legacy name-only exercises inside the wrapper's nested plan", async () => {
    const exercisesService = {
      findExerciseByNormalizedName: vi.fn().mockResolvedValue(CATALOG_EXERCISE),
    };
    const svc = createService(exercisesService);

    const result = (await svc.normalizeProposal(
      "adapt_workout_plan_from_progress",
      { plan: LEGACY_PAYLOAD, sourceTrendObservationIds: [] },
      createContext(),
    )) as { plan: { days: Array<{ exercises: Array<Record<string, unknown>> }> } };

    const exercise = result.plan.days[0]!.exercises[0]!;
    expect(exercise["exerciseId"]).toBe(CATALOG_EXERCISE.id);
    expect(exercise["snapshot"]).toBeTruthy();
  });

  it("returns proposedChanges unchanged when the wrapper does not parse", async () => {
    const svc = createService();
    const changes = { plan: { invalid: true } };

    const result = await svc.normalizeProposal(
      "adapt_workout_plan_from_progress",
      changes,
      createContext(),
    );

    expect(result).toBe(changes);
  });
});
