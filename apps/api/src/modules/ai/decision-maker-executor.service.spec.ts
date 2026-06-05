/**
 * DecisionMakerExecutorService tests
 *
 * Covers:
 *  - valid provider output is returned correctly (not degraded)
 *  - Zod parse failure degrades to fallback
 *  - forbidden-key shape violation degrades to fallback
 *  - provider throwing degrades to fallback (never rethrows)
 *  - fallback has a safe non-empty reply
 *  - fallback has consentRequired=false and empty proposals
 *  - multiple domain outputs are forwarded to the provider
 *  - safety flags are forwarded
 *  - action-variant catalog is forwarded unchanged (not widened)
 *  - workoutCalorieEstimate in domain outputs is NOT forwarded onto the decision output
 *    (decision-maker must not fabricate/re-emit a calorie estimate — Phase 6 only)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FinalDecisionOutputInput, FinalDecisionRequest } from "@health/types";
import { createFallbackDomainAnswer } from "@health/types";
import { DecisionMakerExecutorService } from "./decision-maker-executor.service.js";
import type { DecisionMakerInput } from "./decision-maker-executor.service.js";
import type { CoachAiProvider } from "@health/ai";
import { createCoachAiProviderMock } from "@health/ai/testing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProvider(
  returnValue: FinalDecisionOutputInput | Error,
): CoachAiProvider {
  return createCoachAiProviderMock({
    generateFinalDecision: vi.fn(async (req: FinalDecisionRequest) => {
      void req;
      if (returnValue instanceof Error) throw returnValue;
      return returnValue as FinalDecisionOutputInput;
    }),
  });
}

function makeInput(
  overrides: Partial<DecisionMakerInput> = {},
  providerReturnValue: FinalDecisionOutputInput | Error = {
    reply: "Here is your coaching summary.",
    selectedAction: null,
    proposals: [],
    consentRequired: false,
  },
): DecisionMakerInput {
  return {
    userMessage: "I want a lighter workout and a healthier meal plan.",
    domainOutputs: [createFallbackDomainAnswer("workout")],
    actionVariantCatalog: [
      { id: "plain_reply", label: "Plain reply", requiresConsent: false },
      { id: "adapt_workout_plan", label: "Adapt workout plan", requiresConsent: false },
    ],
    safetyFlags: [],
    safetyConstraints: ["Do not diagnose or prescribe treatment."],
    provider: makeProvider(providerReturnValue) as CoachAiProvider,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DecisionMakerExecutorService", () => {
  let service: DecisionMakerExecutorService;

  beforeEach(() => {
    service = new DecisionMakerExecutorService();
  });

  describe("valid provider output", () => {
    it("returns the provider output when it is valid", async () => {
      const result = await service.execute(makeInput());
      expect(result.degraded).toBe(false);
      expect(result.output.reply).toBe("Here is your coaching summary.");
    });

    it("returns degradedReasons as empty on success", async () => {
      const result = await service.execute(makeInput());
      expect(result.degradedReasons).toHaveLength(0);
    });

    it("passes the user message to the provider", async () => {
      let capturedRequest: FinalDecisionRequest | undefined;
      const provider: Pick<CoachAiProvider, "generateFinalDecision"> = {
        generateFinalDecision: vi.fn(async (req) => {
          capturedRequest = req;
          return { reply: "ok", selectedAction: null, proposals: [], consentRequired: false };
        }),
      };
      await service.execute(makeInput({}, { reply: "ok", selectedAction: null, proposals: [], consentRequired: false })
        ?? makeInput({ provider: provider as CoachAiProvider }));

      // Use a properly set provider
      await service.execute({
        ...makeInput(),
        provider: provider as CoachAiProvider,
        userMessage: "specific message",
      });
      expect(capturedRequest?.userMessage).toBe("specific message");
    });

    it("forwards domain outputs to the provider", async () => {
      let capturedRequest: FinalDecisionRequest | undefined;
      const provider: Pick<CoachAiProvider, "generateFinalDecision"> = {
        generateFinalDecision: vi.fn(async (req) => {
          capturedRequest = req;
          return { reply: "ok", selectedAction: null, proposals: [], consentRequired: false };
        }),
      };
      const workoutAnswer = createFallbackDomainAnswer("workout");
      const nutritionAnswer = createFallbackDomainAnswer("nutrition");
      await service.execute({
        ...makeInput(),
        provider: provider as CoachAiProvider,
        domainOutputs: [workoutAnswer, nutritionAnswer],
      });
      expect(capturedRequest?.domainOutputs).toHaveLength(2);
    });

    it("forwards the action-variant catalog to the provider unchanged", async () => {
      // Uses a synthetic catalog entry to verify the service is catalog-agnostic:
      // it forwards whatever catalog it receives without modification. The
      // "synthetic_consent_variant" id does not correspond to any real catalog entry.
      let capturedRequest: FinalDecisionRequest | undefined;
      const provider: Pick<CoachAiProvider, "generateFinalDecision"> = {
        generateFinalDecision: vi.fn(async (req) => {
          capturedRequest = req;
          return { reply: "ok", selectedAction: null, proposals: [], consentRequired: false };
        }),
      };
      const catalog = [
        { id: "plain_reply", label: "Plain reply", requiresConsent: false },
        { id: "synthetic_consent_variant", label: "Synthetic consent entry (test-only)", requiresConsent: true },
      ];
      await service.execute({
        ...makeInput(),
        provider: provider as CoachAiProvider,
        actionVariantCatalog: catalog,
      });
      expect(capturedRequest?.actionVariantCatalog).toEqual(catalog);
    });

    it("forwards safety flags to the provider", async () => {
      let capturedRequest: FinalDecisionRequest | undefined;
      const provider: Pick<CoachAiProvider, "generateFinalDecision"> = {
        generateFinalDecision: vi.fn(async (req) => {
          capturedRequest = req;
          return { reply: "ok", selectedAction: null, proposals: [], consentRequired: false };
        }),
      };
      await service.execute({
        ...makeInput(),
        provider: provider as CoachAiProvider,
        safetyFlags: ["pain", "fatigue"],
      });
      expect(capturedRequest?.safetyFlags).toEqual(["pain", "fatigue"]);
    });
  });

  describe("degradation: provider throws", () => {
    it("returns a fallback when the provider throws", async () => {
      const result = await service.execute(
        makeInput({}, new Error("OpenAI timeout")),
      );
      expect(result.degraded).toBe(true);
    });

    it("never rethrows the provider error", async () => {
      await expect(
        service.execute(makeInput({}, new Error("fatal provider error"))),
      ).resolves.toBeDefined();
    });

    it("includes the error message in degradedReasons", async () => {
      const result = await service.execute(
        makeInput({}, new Error("network failure")),
      );
      expect(result.degradedReasons.some((r) => r.includes("network failure"))).toBe(true);
    });
  });

  describe("degradation: shape guard failure", () => {
    it("degrades when the provider output contains a forbidden field ('advice')", async () => {
      const badOutput = {
        reply: "Here is your plan.",
        selectedAction: null,
        proposals: [],
        consentRequired: false,
        advice: "This is medical advice",  // FORBIDDEN
      };
      const result = await service.execute(
        makeInput({}, badOutput as unknown as FinalDecisionOutputInput),
      );
      expect(result.degraded).toBe(true);
    });

    it("degrades when the provider output contains a forbidden field ('tool')", async () => {
      const badOutput = {
        reply: "Here is your plan.",
        selectedAction: null,
        proposals: [],
        consentRequired: false,
        tool: "getUserContextSlice",  // FORBIDDEN
      };
      const result = await service.execute(
        makeInput({}, badOutput as unknown as FinalDecisionOutputInput),
      );
      expect(result.degraded).toBe(true);
    });
  });

  describe("degradation: Zod parse failure", () => {
    it("degrades when reply is missing", async () => {
      const badOutput = {
        selectedAction: null,
        proposals: [],
        consentRequired: false,
        // reply is intentionally missing
      };
      const result = await service.execute(
        makeInput({}, badOutput as unknown as FinalDecisionOutputInput),
      );
      expect(result.degraded).toBe(true);
    });

    it("degrades when proposals exceeds max (5)", async () => {
      const tooManyProposals = Array.from({ length: 6 }, (_, i) => ({
        intent: `intent_${i}`,
        targetDomain: "workout",
        title: `Proposal ${i}`,
        reason: "test",
        proposedChanges: {},
      }));
      const badOutput: FinalDecisionOutputInput = {
        reply: "Here is your plan.",
        selectedAction: null,
        proposals: tooManyProposals,
        consentRequired: false,
      };
      const result = await service.execute(makeInput({}, badOutput));
      expect(result.degraded).toBe(true);
    });
  });

  describe("fallback output safety", () => {
    it("fallback reply is a non-empty string", async () => {
      const result = await service.execute(
        makeInput({}, new Error("trigger fallback")),
      );
      expect(result.output.reply.trim().length).toBeGreaterThan(0);
    });

    it("fallback has consentRequired=false", async () => {
      const result = await service.execute(
        makeInput({}, new Error("trigger fallback")),
      );
      expect(result.output.consentRequired).toBe(false);
    });

    it("fallback has empty proposals", async () => {
      const result = await service.execute(
        makeInput({}, new Error("trigger fallback")),
      );
      expect(result.output.proposals).toHaveLength(0);
    });

    it("fallback selectedAction is null", async () => {
      const result = await service.execute(
        makeInput({}, new Error("trigger fallback")),
      );
      expect(result.output.selectedAction).toBeNull();
    });
  });

  describe("calorie estimate safety (Phase 5 floor)", () => {
    it("does not put workoutCalorieEstimate onto the decision output", async () => {
      // Domain output from the workout LLM carries a calorie estimate.
      // The decision-maker output must NOT expose it — ActionResolver handles
      // that copy-with-provenance in Phase 6.
      const workoutDomainAnswer = {
        kind: "domain_answer" as const,
        domain: "workout" as const,
        summary: "Workout looks good.",
        candidateProposals: [],
        domainSignals: [],
        workoutCalorieEstimate: 350,
      };
      const providerOutput: FinalDecisionOutputInput = {
        reply: "Your workout plan is ready.",
        selectedAction: "adapt_workout_plan",
        proposals: [],
        consentRequired: false,
        // workoutCalorieEstimate must NOT appear here — the schema forbids extra fields
        // and ActionResolver owns the provenance copy in Phase 6.
      };
      const result = await service.execute({
        ...makeInput(),
        domainOutputs: [workoutDomainAnswer],
        provider: makeProvider(providerOutput) as CoachAiProvider,
      });
      expect(result.degraded).toBe(false);
      // Verify the final decision output does not carry a calorie field
      expect((result.output as Record<string, unknown>)["workoutCalorieEstimate"]).toBeUndefined();
    });
  });

  describe("consentRequired forwarding", () => {
    it("preserves consentRequired=true when provider returns it", async () => {
      // Uses a synthetic selectedAction id: no real catalog produces "synthetic_consent_variant".
      // The test verifies the service forwards consentRequired as-is (it is catalog-agnostic).
      const providerOutput: FinalDecisionOutputInput = {
        reply: "Consent is required to save this medical document.",
        selectedAction: "synthetic_consent_variant",
        proposals: [],
        consentRequired: true,
      };
      const result = await service.execute(makeInput({}, providerOutput));
      expect(result.degraded).toBe(false);
      expect(result.output.consentRequired).toBe(true);
    });

    it("preserves consentRequired=false when provider returns it", async () => {
      const providerOutput: FinalDecisionOutputInput = {
        reply: "Here is your workout plan.",
        selectedAction: "adapt_workout_plan",
        proposals: [],
        consentRequired: false,
      };
      const result = await service.execute(makeInput({}, providerOutput));
      expect(result.degraded).toBe(false);
      expect(result.output.consentRequired).toBe(false);
    });
  });

  describe("selectedAction catalog constraint", () => {
    it("valid selectedAction within catalog passes through", async () => {
      const providerOutput: FinalDecisionOutputInput = {
        reply: "Here is your workout plan.",
        selectedAction: "adapt_workout_plan",
        proposals: [],
        consentRequired: false,
      };
      const result = await service.execute(
        makeInput(
          {
            actionVariantCatalog: [
              { id: "plain_reply", label: "Plain reply", requiresConsent: false },
              { id: "adapt_workout_plan", label: "Adapt workout plan", requiresConsent: false },
            ],
          },
          providerOutput,
        ),
      );
      // DecisionMakerExecutorService does not itself filter against the catalog —
      // that is ActionResolver's job. The service only validates the schema and shape.
      // The selectedAction is forwarded as-is; ActionResolver re-filters downstream.
      expect(result.degraded).toBe(false);
      expect(result.output.selectedAction).toBe("adapt_workout_plan");
    });

    it("selectedAction null is valid (plain reply selection)", async () => {
      const providerOutput: FinalDecisionOutputInput = {
        reply: "Here is some coaching advice.",
        selectedAction: null,
        proposals: [],
        consentRequired: false,
      };
      const result = await service.execute(makeInput({}, providerOutput));
      expect(result.degraded).toBe(false);
      expect(result.output.selectedAction).toBeNull();
    });
  });

  describe("multiple domain outputs forwarding", () => {
    it("passes all three domain outputs (max fan-out) to the provider", async () => {
      let capturedRequest: FinalDecisionRequest | undefined;
      const provider: Pick<CoachAiProvider, "generateFinalDecision"> = {
        generateFinalDecision: vi.fn(async (req) => {
          capturedRequest = req;
          return { reply: "Synthesized reply.", selectedAction: null, proposals: [], consentRequired: false };
        }),
      };
      const workoutAnswer = createFallbackDomainAnswer("workout");
      const nutritionAnswer = createFallbackDomainAnswer("nutrition");
      const healthAnswer = createFallbackDomainAnswer("health");
      await service.execute({
        ...makeInput(),
        provider: provider as CoachAiProvider,
        domainOutputs: [workoutAnswer, nutritionAnswer, healthAnswer],
      });
      expect(capturedRequest?.domainOutputs).toHaveLength(3);
      expect(capturedRequest?.domainOutputs.map((d) => d.domain)).toEqual(
        expect.arrayContaining(["workout", "nutrition", "health"]),
      );
    });
  });

  // -------------------------------------------------------------------------
  // W4 — domain candidate + matching catalog action keeps the proposal
  // -------------------------------------------------------------------------

  describe("W4 — domain candidate + matching action keeps proposal; fallback yields selectedAction:null", () => {
    it("returns the proposal when provider selects the matching action and copies the domain candidate", async () => {
      // Simulates a workout domain output with a create_workout_plan candidate.
      // The decision-maker selects create_workout_plan and copies the candidate into proposals[].
      const workoutDomainAnswer = {
        kind: "domain_answer" as const,
        domain: "workout" as const,
        summary: "Generating 3-day strength plan.",
        candidateProposals: [
          {
            intent: "create_workout_plan",
            targetDomain: "workout",
            title: "3-Day Strength Plan",
            reason: "User requested a strength plan.",
            proposedChanges: {
              title: "3-Day Strength Plan",
              summary: "Full-body strength program.",
              days: [
                { weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] },
              ],
              notes: [],
            },
          },
        ],
        domainSignals: ["explicit_plan_request"],
      };

      const providerOutput: FinalDecisionOutputInput = {
        reply: "Here is your 3-day strength plan!",
        selectedAction: "create_workout_plan",
        proposals: [
          {
            intent: "create_workout_plan",
            targetDomain: "workout",
            title: "3-Day Strength Plan",
            reason: "User requested a strength plan.",
            proposedChanges: {
              title: "3-Day Strength Plan",
              summary: "Full-body strength program.",
              days: [
                { weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] },
              ],
              notes: [],
            },
          },
        ],
        consentRequired: false,
      };

      const result = await service.execute(
        makeInput(
          {
            domainOutputs: [workoutDomainAnswer],
            actionVariantCatalog: [
              { id: "plain_reply", label: "Plain reply", requiresConsent: false },
              { id: "create_workout_plan", label: "Create workout plan", requiresConsent: false },
            ],
          },
          providerOutput,
        ),
      );

      expect(result.degraded).toBe(false);
      expect(result.output.selectedAction).toBe("create_workout_plan");
      expect(result.output.proposals).toHaveLength(1);
      expect(result.output.proposals[0]?.intent).toBe("create_workout_plan");
      expect(result.output.reply).toContain("strength plan");
    });

    it("degraded fallback always yields selectedAction:null and empty proposals", async () => {
      // Verify that the safe fallback path (provider throws) yields the correct safe state.
      const result = await service.execute(
        makeInput({}, new Error("simulate decision-maker failure")),
      );

      expect(result.degraded).toBe(true);
      expect(result.output.selectedAction).toBeNull();
      expect(result.output.proposals).toHaveLength(0);
      // Fallback reply must be non-empty safe coaching text
      expect(result.output.reply.trim().length).toBeGreaterThan(0);
    });

    it("when provider picks plain_reply the proposals array is forwarded empty", async () => {
      // Plain reply is the fallback — no proposal card should be returned.
      const providerOutput: FinalDecisionOutputInput = {
        reply: "Here is some general wellness advice.",
        selectedAction: "plain_reply",
        proposals: [],
        consentRequired: false,
      };

      const result = await service.execute(makeInput({}, providerOutput));

      expect(result.degraded).toBe(false);
      expect(result.output.selectedAction).toBe("plain_reply");
      expect(result.output.proposals).toHaveLength(0);
    });
  });
});
