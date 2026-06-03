/**
 * Phase 2 parallel-domain pipeline: stub provider tests.
 *
 * Covers generateRouterDecision, generateDomainStep, generateFinalDecision on StubCoachAiProvider.
 * The methods exist but are NOT called by the orchestrator yet (dark ship).
 */
import { describe, expect, it } from "vitest";
import {
  type AgentToolCallResult,
  domainLlmStepOutputSchema,
  finalDecisionOutputSchema,
  logNutritionIncidentProposalPayloadSchema,
  routerDecisionOutputSchema,
} from "@health/types";
import { StubCoachAiProvider } from "./stub-provider.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const provider = new StubCoachAiProvider();

function makePreprocessor(overrides: {
  workout?: boolean;
  nutrition?: boolean;
  fatigue?: boolean;
  pain?: boolean;
  sleep?: boolean;
  normalizedText?: string;
} = {}) {
  return {
    originalText: overrides.normalizedText ?? "test message",
    normalizedText: overrides.normalizedText ?? "test message",
    detectedLanguage: "en",
    responseLanguage: "en",
    hasAttachments: false,
    mentionedDates: [],
    simpleSignals: {
      workout: overrides.workout ?? false,
      nutrition: overrides.nutrition ?? false,
      today: false,
      sleep: overrides.sleep ?? false,
      fatigue: overrides.fatigue ?? false,
      pain: overrides.pain ?? false,
      document: false,
      attachment: false,
    },
    directPathCandidate: null,
  };
}

function makeRouterRequest(
  normalizedText: string,
  preprocessorOverrides: Parameters<typeof makePreprocessor>[0] = {},
  attachmentHints: Array<{ category: string; mimeType?: string }> = [],
) {
  return {
    originalText: normalizedText,
    normalizedText,
    preprocessor: makePreprocessor({ ...preprocessorOverrides, normalizedText }),
    attachmentHints,
    recentMessageHints: [] as Array<{ role: "user" | "assistant" | "system"; content: string }>,
    availableDomains: [] as Array<{ domain: "workout" | "nutrition" | "health"; capabilityIds: string[]; intentSummaries: string[] }>,
    safetyGuardrails: [] as string[],
  };
}

function makeDomainRequest(
  domain: "workout" | "nutrition" | "health",
  userMessage: string,
) {
  return {
    domain,
    iteration: 0,
    maxIterations: 3,
    priorToolResults: [] as AgentToolCallResult[],
    userMessage,
    recentMessages: [] as Array<{ role: "user" | "assistant" | "system"; content: string }>,
    coachingContext: {} as Record<string, unknown>,
    allowedTools: [] as Array<"getUserContextSlice" | "getDocumentContext" | "getWeeklyProgressContext">,
    allowedProposalIntents: [] as string[],
    safetyFlags: [] as Array<"fatigue" | "pain" | "sleep_issue" | "stress" | "hunger" | "schedule_conflict" | "health_context">,
    safetyConstraints: [] as string[],
  };
}

// ---------------------------------------------------------------------------
// generateRouterDecision
// ---------------------------------------------------------------------------

describe("StubCoachAiProvider.generateRouterDecision", () => {
  it("returns schema-valid RouterDecisionOutput", async () => {
    const raw = await provider.generateRouterDecision(
      makeRouterRequest("can you adjust my workout plan", { workout: true }),
    );
    const parsed = routerDecisionOutputSchema.safeParse(raw);

    expect(parsed.success).toBe(true);
  });

  it("selects 'workout' domain when workout signal is present", async () => {
    const raw = await provider.generateRouterDecision(
      makeRouterRequest("i want to adjust my workout", { workout: true }),
    );
    const parsed = routerDecisionOutputSchema.parse(raw);

    expect(parsed.selectedDomains.some((d) => d.domain === "workout")).toBe(true);
  });

  it("selects 'workout' domain for keyword 'training' in message", async () => {
    const raw = await provider.generateRouterDecision(
      makeRouterRequest("help me with my training program"),
    );
    const parsed = routerDecisionOutputSchema.parse(raw);

    expect(parsed.selectedDomains.some((d) => d.domain === "workout")).toBe(true);
  });

  it("selects 'nutrition' domain when nutrition signal is present", async () => {
    const raw = await provider.generateRouterDecision(
      makeRouterRequest("suggest a meal plan", { nutrition: true }),
    );
    const parsed = routerDecisionOutputSchema.parse(raw);

    expect(parsed.selectedDomains.some((d) => d.domain === "nutrition")).toBe(true);
  });

  it("selects 'nutrition' domain for keyword 'food' in message", async () => {
    const raw = await provider.generateRouterDecision(
      makeRouterRequest("what food should i eat"),
    );
    const parsed = routerDecisionOutputSchema.parse(raw);

    expect(parsed.selectedDomains.some((d) => d.domain === "nutrition")).toBe(true);
  });

  it("selects 'health' domain when pain signal is present", async () => {
    const raw = await provider.generateRouterDecision(
      makeRouterRequest("my knee has been hurting", { pain: true }),
    );
    const parsed = routerDecisionOutputSchema.parse(raw);

    expect(parsed.selectedDomains.some((d) => d.domain === "health")).toBe(true);
  });

  it("selects 'health' domain when fatigue signal is present", async () => {
    const raw = await provider.generateRouterDecision(
      makeRouterRequest("i feel exhausted today", { fatigue: true }),
    );
    const parsed = routerDecisionOutputSchema.parse(raw);

    expect(parsed.selectedDomains.some((d) => d.domain === "health")).toBe(true);
  });

  it("selects 'health' domain when a medical_document attachment hint is present", async () => {
    const raw = await provider.generateRouterDecision(
      makeRouterRequest("here is my health report", {}, [{ category: "medical_document" }]),
    );
    const parsed = routerDecisionOutputSchema.parse(raw);

    expect(parsed.selectedDomains.some((d) => d.domain === "health")).toBe(true);
  });

  it("caps selectedDomains to at most 3", async () => {
    // Trigger all three domains simultaneously
    const raw = await provider.generateRouterDecision(
      makeRouterRequest("workout nutrition pain today", { workout: true, nutrition: true, pain: true }),
    );
    const parsed = routerDecisionOutputSchema.parse(raw);

    expect(parsed.selectedDomains.length).toBeLessThanOrEqual(3);
  });

  it("adds 'pain' safety flag when pain signal is present", async () => {
    const raw = await provider.generateRouterDecision(
      makeRouterRequest("my knee hurts badly", { pain: true }),
    );
    const parsed = routerDecisionOutputSchema.parse(raw);

    expect(parsed.safetyFlags).toContain("pain");
  });

  it("adds 'fatigue' safety flag when fatigue signal is present", async () => {
    const raw = await provider.generateRouterDecision(
      makeRouterRequest("i am really fatigued", { fatigue: true }),
    );
    const parsed = routerDecisionOutputSchema.parse(raw);

    expect(parsed.safetyFlags).toContain("fatigue");
  });

  it("adds 'sleep_issue' safety flag when sleep signal is present", async () => {
    const raw = await provider.generateRouterDecision(
      makeRouterRequest("i cannot sleep well", { sleep: true }),
    );
    const parsed = routerDecisionOutputSchema.parse(raw);

    expect(parsed.safetyFlags).toContain("sleep_issue");
  });

  it("returns a fallback workout selection when no domain signals match", async () => {
    const raw = await provider.generateRouterDecision(
      makeRouterRequest("hello there"),
    );
    const parsed = routerDecisionOutputSchema.parse(raw);

    // Fallback selection exists
    expect(parsed.selectedDomains.length).toBeGreaterThan(0);
    // confidence exists and is valid
    expect(parsed.confidence).toBeGreaterThanOrEqual(0);
    expect(parsed.confidence).toBeLessThanOrEqual(1);
  });

  it("output does NOT contain forbidden fields (reply/proposals/tool/text)", async () => {
    const raw = await provider.generateRouterDecision(
      makeRouterRequest("help me with workout"),
    );

    expect(raw).not.toHaveProperty("reply");
    expect(raw).not.toHaveProperty("proposals");
    expect(raw).not.toHaveProperty("tool");
    expect(raw).not.toHaveProperty("text");
  });

  it("is deterministic: same input produces same domain selection", async () => {
    const request = makeRouterRequest("i want to adjust my workout", { workout: true });
    const [first, second] = await Promise.all([
      provider.generateRouterDecision(request),
      provider.generateRouterDecision(request),
    ]);
    const p1 = routerDecisionOutputSchema.parse(first);
    const p2 = routerDecisionOutputSchema.parse(second);

    expect(p1.selectedDomains.map((d) => d.domain)).toEqual(
      p2.selectedDomains.map((d) => d.domain),
    );
  });
});

// ---------------------------------------------------------------------------
// generateDomainStep
// ---------------------------------------------------------------------------

describe("StubCoachAiProvider.generateDomainStep", () => {
  it("returns schema-valid DomainLlmStepOutput for workout domain", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequest("workout", "Can you adjust my workout plan?"),
    );
    const parsed = domainLlmStepOutputSchema.safeParse(raw);

    expect(parsed.success).toBe(true);
  });

  it("returns schema-valid DomainLlmStepOutput for nutrition domain", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequest("nutrition", "Suggest a meal plan"),
    );
    const parsed = domainLlmStepOutputSchema.safeParse(raw);

    expect(parsed.success).toBe(true);
  });

  it("returns schema-valid DomainLlmStepOutput for health domain", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequest("health", "I feel fatigued"),
    );
    const parsed = domainLlmStepOutputSchema.safeParse(raw);

    expect(parsed.success).toBe(true);
  });

  it("returns domain_answer for workout domain", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequest("workout", "help with training"),
    );

    expect(raw.kind).toBe("domain_answer");
  });

  it("includes workoutCalorieEstimate ONLY for workout domain", async () => {
    const workoutRaw = await provider.generateDomainStep(
      makeDomainRequest("workout", "help with training"),
    );

    expect(workoutRaw.kind).toBe("domain_answer");
    if (workoutRaw.kind === "domain_answer") {
      expect(workoutRaw.workoutCalorieEstimate).toBeDefined();
      expect(typeof workoutRaw.workoutCalorieEstimate).toBe("number");
    }
  });

  it("does NOT include workoutCalorieEstimate for nutrition domain", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequest("nutrition", "suggest meals"),
    );

    expect(raw.kind).toBe("domain_answer");
    if (raw.kind === "domain_answer") {
      expect(raw.workoutCalorieEstimate).toBeUndefined();
    }
  });

  it("does NOT include workoutCalorieEstimate for health domain", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequest("health", "I feel fatigued"),
    );

    expect(raw.kind).toBe("domain_answer");
    if (raw.kind === "domain_answer") {
      expect(raw.workoutCalorieEstimate).toBeUndefined();
    }
  });

  it("workout domain output passes superRefine workoutCalorieEstimate domain constraint", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequest("workout", "help with training"),
    );
    // This parse must succeed — if workoutCalorieEstimate is present on domain=workout, it should not be rejected
    const parsed = domainLlmStepOutputSchema.safeParse(raw);

    expect(parsed.success).toBe(true);
  });

  it("returns candidate proposals for workout domain", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequest("workout", "help with my workout"),
    );

    expect(raw.kind).toBe("domain_answer");
    if (raw.kind === "domain_answer") {
      expect(Array.isArray(raw.candidateProposals)).toBe(true);
      expect((raw.candidateProposals ?? []).length).toBeGreaterThan(0);
    }
  });

  it("returns a reduce-load workout proposal for 'reduce' keyword", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequest("workout", "can you reduce my load this week"),
    );

    expect(raw.kind).toBe("domain_answer");
    if (raw.kind === "domain_answer") {
      const hasReduceProposal = (raw.candidateProposals ?? []).some(
        (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "adapt_workout_plan",
      );
      expect(hasReduceProposal).toBe(true);
    }
  });

  it("returns candidate proposals for nutrition domain", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequest("nutrition", "suggest a meal plan"),
    );

    expect(raw.kind).toBe("domain_answer");
    if (raw.kind === "domain_answer") {
      expect(Array.isArray(raw.candidateProposals)).toBe(true);
      expect((raw.candidateProposals ?? []).length).toBeGreaterThan(0);
    }
  });

  it("health domain returns empty proposals (consent-gated, context-only)", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequest("health", "my knee has been hurting"),
    );

    expect(raw.kind).toBe("domain_answer");
    if (raw.kind === "domain_answer") {
      expect(raw.candidateProposals).toEqual([]);
    }
  });

  it("output does NOT contain forbidden reply field", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequest("workout", "help with training"),
    );

    expect(raw).not.toHaveProperty("reply");
    expect(raw).not.toHaveProperty("text");
    expect(raw).not.toHaveProperty("advice");
  });
});

// ---------------------------------------------------------------------------
// generateFinalDecision
// ---------------------------------------------------------------------------

describe("StubCoachAiProvider.generateFinalDecision", () => {
  const workoutDomainOutput = {
    kind: "domain_answer" as const,
    domain: "workout" as const,
    summary: "Reviewed your workout context and drafted a candidate plan adjustment.",
    candidateProposals: [
      {
        intent: "adapt_workout_plan",
        targetDomain: "workout",
        title: "Reduce load",
        reason: "Recovery week.",
        proposedChanges: {},
      },
    ],
    domainSignals: ["workout_plan_present"],
    workoutCalorieEstimate: 280,
  };

  const nutritionDomainOutput = {
    kind: "domain_answer" as const,
    domain: "nutrition" as const,
    summary: "Reviewed your nutrition context and prepared candidate suggestions.",
    candidateProposals: [
      {
        intent: "create_nutrition_plan",
        targetDomain: "nutrition",
        title: "Balanced daily nutrition base",
        reason: "Starting point.",
        proposedChanges: {},
      },
    ],
    domainSignals: ["nutrition_plan_present"],
  };

  const healthDomainOutput = {
    kind: "domain_answer" as const,
    domain: "health" as const,
    summary: "Health context noted. No structured changes proposed without consent.",
    candidateProposals: [],
    domainSignals: [],
  };

  it("returns schema-valid FinalDecisionOutput", async () => {
    const raw = await provider.generateFinalDecision({
      userMessage: "Adjust my workout this week",
      domainOutputs: [workoutDomainOutput],
      actionVariantCatalog: [],
      safetyFlags: [],
      safetyConstraints: [],
    });
    const parsed = finalDecisionOutputSchema.safeParse(raw);

    expect(parsed.success).toBe(true);
  });

  it("reply is always a non-empty string", async () => {
    const raw = await provider.generateFinalDecision({
      userMessage: "Help me",
      domainOutputs: [workoutDomainOutput],
      actionVariantCatalog: [],
      safetyFlags: [],
      safetyConstraints: [],
    });

    expect(typeof raw.reply).toBe("string");
    expect(raw.reply.length).toBeGreaterThan(0);
  });

  it("includes proposals from domain outputs", async () => {
    const raw = await provider.generateFinalDecision({
      userMessage: "Adjust my workout this week",
      domainOutputs: [workoutDomainOutput],
      actionVariantCatalog: [],
      safetyFlags: [],
      safetyConstraints: [],
    });

    expect(Array.isArray(raw.proposals)).toBe(true);
    expect((raw.proposals ?? []).length).toBeGreaterThan(0);
  });

  it("collects proposals from all domain outputs", async () => {
    const raw = await provider.generateFinalDecision({
      userMessage: "Adjust workout and nutrition",
      domainOutputs: [workoutDomainOutput, nutritionDomainOutput],
      actionVariantCatalog: [],
      safetyFlags: [],
      safetyConstraints: [],
    });

    // Should have proposals from both domains
    expect((raw.proposals ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("consentRequired is true when health domain is present", async () => {
    const raw = await provider.generateFinalDecision({
      userMessage: "My knee hurts",
      domainOutputs: [healthDomainOutput],
      actionVariantCatalog: [],
      safetyFlags: [],
      safetyConstraints: [],
    });

    expect(raw.consentRequired).toBe(true);
  });

  it("consentRequired is false when no health domain is present", async () => {
    const raw = await provider.generateFinalDecision({
      userMessage: "Adjust my workout",
      domainOutputs: [workoutDomainOutput],
      actionVariantCatalog: [],
      safetyFlags: [],
      safetyConstraints: [],
    });

    expect(raw.consentRequired).toBe(false);
  });

  it("falls back to safe reply when domainOutputs is empty", async () => {
    const raw = await provider.generateFinalDecision({
      userMessage: "Help me with wellness",
      domainOutputs: [],
      actionVariantCatalog: [],
      safetyFlags: [],
      safetyConstraints: [],
    });

    expect(typeof raw.reply).toBe("string");
    expect(raw.reply.length).toBeGreaterThan(0);
    expect(raw.consentRequired).toBe(false);
  });

  it("falls back to safe reply when all domain summaries are empty", async () => {
    const raw = await provider.generateFinalDecision({
      userMessage: "Help me",
      domainOutputs: [
        {
          kind: "domain_answer",
          domain: "workout",
          summary: "   ",
          candidateProposals: [],
          domainSignals: [],
        },
      ],
      actionVariantCatalog: [],
      safetyFlags: [],
      safetyConstraints: [],
    });

    expect(typeof raw.reply).toBe("string");
    expect(raw.reply.length).toBeGreaterThan(0);
  });

  it("caps proposals to at most 5", async () => {
    // Build domain outputs with many proposals each
    const manyProposals = Array.from({ length: 4 }, (_, i) => ({
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: `Proposal ${i}`,
      reason: "reason",
      proposedChanges: {},
    }));

    const raw = await provider.generateFinalDecision({
      userMessage: "Adjust everything",
      domainOutputs: [
        { ...workoutDomainOutput, candidateProposals: manyProposals },
        { ...nutritionDomainOutput, candidateProposals: manyProposals },
      ],
      actionVariantCatalog: [],
      safetyFlags: [],
      safetyConstraints: [],
    });

    expect((raw.proposals ?? []).length).toBeLessThanOrEqual(5);
  });

  it("output passes full schema validation", async () => {
    const raw = await provider.generateFinalDecision({
      userMessage: "Adjust my workout and nutrition",
      domainOutputs: [workoutDomainOutput, nutritionDomainOutput],
      actionVariantCatalog: [
        { id: "adapt_workout", label: "Adapt workout plan", requiresConsent: false },
      ],
      safetyFlags: [],
      safetyConstraints: [],
    });

    const parsed = finalDecisionOutputSchema.safeParse(raw);

    expect(parsed.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Step 7b — food photo nutrition analysis (stub provider)
//
// These tests verify that the nutrition domain LLM analyzes food photos
// directly via the bounded attachment context, replacing FoodPhotoAnalysisService.
// ---------------------------------------------------------------------------

describe("StubCoachAiProvider.generateDomainStep — food photo nutrition analysis (Step 7b)", () => {
  function makeDomainRequestWithFoodPhoto(userMessage: string) {
    return {
      ...makeDomainRequest("nutrition", userMessage),
      attachmentContext: {
        items: [
          {
            attachmentRefId: "a1000001-0000-4000-8000-000000000001",
            category: "food_photo",
            mimeType: "image/jpeg",
            consentState: "none" as const,
            storageRef: "local://attachments/meal.jpg",
          },
        ],
      },
    };
  }

  it("returns a log_nutrition_incident proposal when a food_photo attachment is present", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequestWithFoodPhoto("Log this meal from the photo."),
    );

    expect(raw.kind).toBe("domain_answer");
    if (raw.kind === "domain_answer") {
      expect(raw.domain).toBe("nutrition");
      const proposals = raw.candidateProposals ?? [];
      expect(proposals.length).toBeGreaterThan(0);

      const incidentProposal = proposals.find(
        (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "log_nutrition_incident",
      );
      expect(incidentProposal).toBeDefined();
    }
  });

  it("includes approximate calorie and macro estimates in the food photo proposal", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequestWithFoodPhoto("How many calories is this meal?"),
    );

    expect(raw.kind).toBe("domain_answer");
    if (raw.kind === "domain_answer") {
      const proposals = raw.candidateProposals ?? [];
      const incidentProposal = proposals.find(
        (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "log_nutrition_incident",
      );

      expect(incidentProposal).toBeDefined();
      if (incidentProposal && typeof incidentProposal === "object") {
        const changes = (incidentProposal as Record<string, unknown>).proposedChanges;
        expect(changes).toBeDefined();
        if (changes && typeof changes === "object") {
          const changesObj = changes as Record<string, unknown>;
          expect(typeof changesObj.estimatedCalories).toBe("number");
          expect((changesObj.estimatedCalories as number)).toBeGreaterThan(0);
          expect(changesObj.estimatedMacros).toBeDefined();
          expect(changesObj.imageRefs).toBeDefined();
          expect(Array.isArray(changesObj.imageRefs)).toBe(true);
        }
      }
    }
  });

  it("includes the food photo attachment ref id in imageRefs", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequestWithFoodPhoto("Log this meal."),
    );

    expect(raw.kind).toBe("domain_answer");
    if (raw.kind === "domain_answer") {
      const proposals = raw.candidateProposals ?? [];
      const incidentProposal = proposals.find(
        (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "log_nutrition_incident",
      );

      if (incidentProposal && typeof incidentProposal === "object") {
        const changes = (incidentProposal as Record<string, unknown>).proposedChanges;

        if (changes && typeof changes === "object") {
          const imageRefs = (changes as Record<string, unknown>).imageRefs;
          expect(Array.isArray(imageRefs)).toBe(true);
          // imageRefs are objects {id: uuid, ...} per nutritionImageRefSchema.
          const firstRef = (imageRefs as Array<Record<string, unknown>>)[0];
          expect(firstRef).toBeDefined();
          expect(firstRef?.id).toBe("a1000001-0000-4000-8000-000000000001");
        }
      }
    }
  });

  it("sets provenance source to vision_llm_estimate on the food photo proposal", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequestWithFoodPhoto("Analyze this meal photo."),
    );

    expect(raw.kind).toBe("domain_answer");
    if (raw.kind === "domain_answer") {
      const proposals = raw.candidateProposals ?? [];
      const incidentProposal = proposals.find(
        (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "log_nutrition_incident",
      );

      if (incidentProposal && typeof incidentProposal === "object") {
        const changes = (incidentProposal as Record<string, unknown>).proposedChanges;

        if (changes && typeof changes === "object") {
          const provenance = (changes as Record<string, unknown>).provenance;
          expect(provenance).toBeDefined();
          expect((provenance as Record<string, unknown>).source).toBe("vision_llm_estimate");
        }
      }
    }
  });

  it("sets domainSignals to include food_photo_present", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequestWithFoodPhoto("What did I eat?"),
    );

    expect(raw.kind).toBe("domain_answer");
    if (raw.kind === "domain_answer") {
      expect(raw.domainSignals).toContain("food_photo_present");
    }
  });

  it("does NOT include workoutCalorieEstimate on the food photo nutrition answer", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequestWithFoodPhoto("Log this meal from photo."),
    );

    expect(raw.kind).toBe("domain_answer");
    if (raw.kind === "domain_answer") {
      // Safety invariant: only the workout domain may set workoutCalorieEstimate.
      expect(raw.workoutCalorieEstimate).toBeUndefined();
    }
  });

  it("falls back to regular nutrition suggestions when no food_photo is in attachment context", async () => {
    const requestWithoutPhoto = {
      ...makeDomainRequest("nutrition", "Suggest a meal plan"),
      attachmentContext: {
        items: [
          {
            // workout_attachment is not a food_photo — no photo analysis path.
            attachmentRefId: "b1000001-0000-4000-8000-000000000001",
            category: "workout_attachment",
            mimeType: "image/jpeg",
            consentState: "none" as const,
            storageRef: "local://attachments/session.jpg",
          },
        ],
      },
    };

    const raw = await provider.generateDomainStep(requestWithoutPhoto);

    expect(raw.kind).toBe("domain_answer");
    if (raw.kind === "domain_answer") {
      // Should return a regular nutrition proposal, NOT a log_nutrition_incident from photo.
      const photoProposal = (raw.candidateProposals ?? []).find(
        (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "log_nutrition_incident",
      );
      expect(photoProposal).toBeUndefined();
    }
  });

  it("output passes full schema validation with food_photo attachment context", async () => {
    const raw = await provider.generateDomainStep(
      makeDomainRequestWithFoodPhoto("Log this meal."),
    );
    const parsed = domainLlmStepOutputSchema.safeParse(raw);

    expect(parsed.success).toBe(true);
  });

  it("food-photo proposal proposedChanges passes real logNutritionIncidentProposalPayloadSchema — regression guard", async () => {
    // This test exercises the REAL schema (not a mock) to catch any future
    // mismatch between the stub's emitted payload and the schema used by
    // ProposalValidationService. If this fails, the proposal would be marked
    // validationStatus='invalid' in production and never become usable.
    const raw = await provider.generateDomainStep(
      makeDomainRequestWithFoodPhoto("Log this meal from the photo."),
    );

    expect(raw.kind).toBe("domain_answer");
    if (raw.kind !== "domain_answer") return;

    const incidentProposal = (raw.candidateProposals ?? []).find(
      (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "log_nutrition_incident",
    );

    expect(incidentProposal).toBeDefined();
    if (!incidentProposal || typeof incidentProposal !== "object") return;

    const proposedChanges = (incidentProposal as Record<string, unknown>).proposedChanges;
    // Parse against the REAL schema — not a mock validator.
    const result = logNutritionIncidentProposalPayloadSchema.safeParse(proposedChanges);

    if (!result.success) {
      throw new Error(
        `food-photo proposal proposedChanges failed logNutritionIncidentProposalPayloadSchema: ` +
        result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }

    expect(result.success).toBe(true);
    // imageRefs must be non-empty objects (not bare strings).
    expect(result.data.imageRefs.length).toBeGreaterThan(0);
    expect(result.data.imageRefs[0]).toHaveProperty("id");
    // provenance.source must be a valid enum member.
    expect(result.data.provenance.source).toBe("vision_llm_estimate");
  });
});
