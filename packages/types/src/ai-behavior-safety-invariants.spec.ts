import { describe, expect, it } from "vitest";
import {
  buildDefaultAiBehaviorConfig,
  mergeCapabilityConfigOverrides,
  normalizeAiBehaviorConfig,
  resolveLoadedAiBehaviorConfig,
  type AiBehaviorConfig,
} from "./ai-behavior-config.js";
import {
  domainAnswerSchema,
  domainLlmStepOutputSchema,
  validateDomainLlmStepOutputShape,
} from "./domain-llm-step.js";
import {
  workoutPlanPayloadSchema,
  workoutPlanProposalChangesSchema,
  getWorkoutProposalDomainErrors,
  calorieEstimateProvenanceSchema,
} from "./workouts.js";
import {
  shouldTriggerNutritionIncidentProposal,
  shouldTriggerRecipeRecommendationRequest,
  shouldTriggerWellbeingCheckinProposal,
} from "./chat-action-proposals.js";
import { AGENT_CAPABILITY_CONFIGS, getCapabilityConfig } from "./capability-config.js";
import {
  applyContextBudgetSafetyFloor,
  clampContextBudgetPolicy,
  CONTEXT_BUDGET_ABSOLUTE_LIMITS,
  DEFAULT_CONTEXT_BUDGET_POLICY,
  evaluateContextExpansionRequest,
} from "./context-budget.js";
import {
  compileDirectPathMatcher,
  compileRegexPatternRule,
  detectDirectChatPathCandidateFromConfig,
} from "./direct-chat-path-matcher.js";
import {
  compileProposalExplainerMatcher,
  detectProposalExplainerRequestFromConfig,
} from "./proposal-explainer-matcher.js";
import { compilePromptTemplates } from "./prompt-template-renderer.js";
import {
  clampRouterDecisionOutput,
  MAX_ROUTER_SELECTED_DOMAINS,
  routerDecisionOutputSchema,
  validateRouterDecisionOutputShape,
} from "./router-decision.js";
import {
  finalDecisionOutputSchema,
  validateFinalDecisionOutputShape,
} from "./final-decision.js";
import { validateDomainLlmStepOutputShape as validateDomainShape } from "./domain-llm-step.js";
import {
  intersectDomainConfigWithCatalog,
  type DomainConfig,
} from "./domain-config.js";
import { medicalDocumentPersistenceStatusSchema } from "./chat-attachments.js";
import {
  classifyProposalValidationFailure,
  proposalValidationFailureClassSchema,
} from "./index.js";

describe("ai behavior safety invariants", () => {
  describe("invalid config fail-closed loading", () => {
    it("replaces invalid file config with full defaults instead of partial merge", () => {
      const defaults = buildDefaultAiBehaviorConfig();
      const loaded = resolveLoadedAiBehaviorConfig({
        fileValue: {
          version: 1,
          directPaths: { enabled: false },
        },
        defaults,
      });

      expect(loaded.source).toBe("defaults");
      expect(loaded.config).toEqual(defaults);
      expect(loaded.errors.length).toBeGreaterThan(0);
    });

    it("rejects config profiles that exceed absolute budget limits at parse time", () => {
      expect(() =>
        normalizeAiBehaviorConfig({
          contextBudgets: {
            profiles: {
              default: {
                profile: "default",
                maxSlices: CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlices + 1,
                maxRawItems: 0,
                maxLookbackDays: 7,
                allowDocuments: false,
                allowSensitiveHealthContext: false,
                maxExpansionRounds: 0,
                maxSlicesPerExpansionRound: 0,
              },
            },
          },
        } as unknown as Partial<AiBehaviorConfig>),
      ).toThrow();
    });

    it("clamps resolved budget numeric limits to code-owned absolute limits", () => {
      const clamped = clampContextBudgetPolicy({
        profile: "default",
        maxSlices: CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlices + 5,
        maxRawItems: CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxRawItems + 5,
        maxLookbackDays: CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxLookbackDays + 30,
        allowDocuments: true,
        allowSensitiveHealthContext: true,
        maxExpansionRounds: CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxExpansionRounds + 2,
        maxSlicesPerExpansionRound: CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlicesPerExpansionRound + 2,
      });

      expect(clamped.maxSlices).toBe(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlices);
      expect(clamped.maxRawItems).toBe(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxRawItems);
      expect(clamped.maxLookbackDays).toBe(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxLookbackDays);
      expect(clamped.maxExpansionRounds).toBe(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxExpansionRounds);
      expect(clamped.maxSlicesPerExpansionRound).toBe(
        CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlicesPerExpansionRound,
      );
      expect(clamped.allowDocuments).toBe(false);
      expect(clamped.allowSensitiveHealthContext).toBe(false);
    });

    it("cannot enable documents or sensitive health via loaded file config", () => {
      const defaults = buildDefaultAiBehaviorConfig();
      const loaded = resolveLoadedAiBehaviorConfig({
        fileValue: {
          ...defaults,
          contextBudgets: {
            ...defaults.contextBudgets,
            profiles: {
              default: {
                ...defaults.contextBudgets.profiles.default,
                allowDocuments: true,
                allowSensitiveHealthContext: true,
              },
              deep_review: {
                ...defaults.contextBudgets.profiles.deep_review,
                allowDocuments: true,
                allowSensitiveHealthContext: true,
              },
            },
          },
        },
        defaults,
      });

      expect(loaded.source).toBe("file");
      expect(loaded.config.contextBudgets.profiles.default.allowDocuments).toBe(false);
      expect(loaded.config.contextBudgets.profiles.default.allowSensitiveHealthContext).toBe(
        false,
      );
      expect(loaded.config.contextBudgets.profiles.deep_review.allowDocuments).toBe(false);
      expect(loaded.config.contextBudgets.profiles.deep_review.allowSensitiveHealthContext).toBe(
        false,
      );
      expect(
        loaded.warnings.some((warning) => warning.includes("document/sensitive-health")),
      ).toBe(true);
    });

    it("falls back to default deep-review trigger regex when file patterns are invalid", () => {
      const defaults = buildDefaultAiBehaviorConfig();
      const loaded = resolveLoadedAiBehaviorConfig({
        fileValue: {
          ...defaults,
          contextBudgets: {
            ...defaults.contextBudgets,
            triggers: {
              ...defaults.contextBudgets.triggers,
              monthlyReviewMessagePattern: "(unclosed",
              multiDomainMessagePattern: "[invalid",
            },
          },
        },
        defaults,
      });

      expect(loaded.config.contextBudgets.triggers.monthlyReviewMessagePattern).toBe(
        defaults.contextBudgets.triggers.monthlyReviewMessagePattern,
      );
      expect(loaded.config.contextBudgets.triggers.multiDomainMessagePattern).toBe(
        defaults.contextBudgets.triggers.multiDomainMessagePattern,
      );
      expect(loaded.warnings.some((warning) => warning.includes("invalid regex"))).toBe(true);
    });
  });

  describe("invalid regex and template fallback", () => {
    it("drops invalid direct-path regex rules instead of matching broadly", () => {
      expect(compileRegexPatternRule({ source: "(unclosed", flags: "i" })).toBeNull();

      const matcher = compileDirectPathMatcher(
        normalizeAiBehaviorConfig({
          directPaths: {
            kinds: [
              {
                kind: "today_summary_read",
                refreshHintsOnExecuted: [],
                matchPatterns: [{ source: "(unclosed", flags: "i" }],
                negativePatterns: [],
              },
            ],
            detectionOrder: ["today_summary_read"],
          },
        } as unknown as Partial<AiBehaviorConfig>).directPaths,
      );

      expect(matcher.kindsByOrder[0]?.matchPatterns).toEqual([]);
      expect(detectDirectChatPathCandidateFromConfig(matcher.config, "What is today?")).toBeNull();
    });

    it("drops invalid proposal explainer regex rules instead of detecting explainer turns", () => {
      const config = normalizeAiBehaviorConfig({
        proposalExplainer: {
          detectionPatterns: {
            positivePatterns: [{ source: "(unclosed", flags: "i" }],
            negativePatterns: [],
          },
        },
      } as unknown as Partial<AiBehaviorConfig>).proposalExplainer;

      expect(compileProposalExplainerMatcher(config).positivePatterns).toEqual([]);
      expect(detectProposalExplainerRequestFromConfig(config, "Why this proposal?")).toBe(false);
    });

    it("falls back to default prompt templates when config body for router is invalid", () => {
      const compiled = compilePromptTemplates({
        templates: {
          router: {
            templateKey: "router",
            body: "Broken template without placeholders",
            placeholders: [],
          },
        },
      });

      expect(compiled.templates.router.source).toBe("default");
      const rendered = compiled.renderRouterDecision({
        normalizedText: "test",
        originalText: "test",
        detectedLanguage: "en",
        preprocessorJson: "{}",
        attachmentHintsJson: "[]",
        recentMessageHintsJson: "[]",
        availableDomainsJson: "[]",
        safetyGuardrailsJson: "[]",
      });
      expect(rendered).toContain("domain router");
    });
  });

  describe("direct path and explainer guards", () => {
    it("blocks direct paths when attachments are present even with permissive match patterns", () => {
      const config = normalizeAiBehaviorConfig({
        directPaths: {
          blockWhenAttachments: true,
          kinds: [
            {
              kind: "today_summary_read",
              refreshHintsOnExecuted: [],
              matchPatterns: [{ source: ".*", flags: "i" }],
              negativePatterns: [],
            },
          ],
          detectionOrder: ["today_summary_read"],
        },
      } as unknown as Partial<AiBehaviorConfig>).directPaths;

      expect(
        detectDirectChatPathCandidateFromConfig(config, "anything", { hasAttachments: true }),
      ).toBeNull();
    });

    it("blocks proposal explainer detection during proposal revision turns", () => {
      const config = buildDefaultAiBehaviorConfig().proposalExplainer;

      expect(
        detectProposalExplainerRequestFromConfig(config, "Why this proposal?", {
          hasProposalRevision: true,
        }),
      ).toBe(false);
    });
  });

  describe("deterministic proposal trigger safety", () => {
    it("honors skipWhenCrisis from config for wellbeing triggers", () => {
      const config = normalizeAiBehaviorConfig({
        deterministicProposalTriggers: {
          wellbeingCheckin: {
            moodPhrases: ["custom mood"],
            excludeContainsPhrases: [],
            excludeWhenNutritionIncidentSignal: false,
            requireNoTodayCheckIn: false,
            skipWhenCrisis: true,
            enabled: true,
          },
        },
      } as unknown as Partial<AiBehaviorConfig>).deterministicProposalTriggers;

      expect(shouldTriggerWellbeingCheckinProposal("custom mood", false, config)).toBe(true);
      expect(shouldTriggerWellbeingCheckinProposal("custom mood I want to die", false, config)).toBe(
        false,
      );
    });

    it("honors enabled=false from config for nutrition and recipe triggers", () => {
      const config = normalizeAiBehaviorConfig({
        deterministicProposalTriggers: {
          nutritionIncident: {
            phrases: ["cheat meal"],
            enabled: false,
            skipWhenCrisis: true,
          },
          recipeRecommendation: {
            phrases: ["dinner ideas"],
            enabled: false,
            excludeWhenNutritionIncidentSignal: true,
            skipWhenCrisis: true,
          },
        },
      } as unknown as Partial<AiBehaviorConfig>).deterministicProposalTriggers;

      expect(shouldTriggerNutritionIncidentProposal("I had a cheat meal tonight", config)).toBe(
        false,
      );
      expect(
        shouldTriggerRecipeRecommendationRequest("Can you suggest some dinner ideas?", config),
      ).toBe(false);
    });
  });

  describe("capability override safety", () => {
    it("ignores invalid capability overrides without dropping the base catalog", () => {
      const merged = mergeCapabilityConfigOverrides(AGENT_CAPABILITY_CONFIGS, [
        { capabilityId: "not-a-real-capability" } as never,
      ]);

      expect(merged.length).toBe(AGENT_CAPABILITY_CONFIGS.length);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 6: calorie provenance floor regression
// These tests are safety regressions — they assert the structural invariants
// that must NEVER be weakened:
//   1. estimatedSessionCalorieBurn can only originate from workout_llm or user_manual.
//   2. workoutCalorieEstimate is structurally forbidden on non-workout domain answers.
//   3. The decision-maker output (FinalDecisionOutput) has NO calorie field.
//   4. calorieEstimateProvenance requires estimatedSessionCalorieBurn to be co-present.
// ---------------------------------------------------------------------------

describe("calorie provenance floor — Phase 6 safety regression", () => {
  describe("calorieEstimateProvenanceSchema only allows the two valid sources", () => {
    it("accepts workout_llm provenance (LLM-sourced from ActionResolver)", () => {
      expect(calorieEstimateProvenanceSchema.parse("workout_llm")).toBe("workout_llm");
    });

    it("accepts user_manual provenance (user-overridden value)", () => {
      expect(calorieEstimateProvenanceSchema.parse("user_manual")).toBe("user_manual");
    });

    it("rejects any other provenance string — including fabricated decision-maker sources", () => {
      // A decision-maker, nutrition domain, or any code that attempts to stamp an
      // unknown provenance must fail schema validation.
      for (const fabricated of [
        "decision_maker_llm",
        "nutrition_llm",
        "health_llm",
        "auto",
        "system",
        "",
      ]) {
        expect(() => calorieEstimateProvenanceSchema.parse(fabricated)).toThrow();
      }
    });
  });

  describe("domainAnswerSchema: workoutCalorieEstimate is only valid on the workout domain", () => {
    it("accepts workoutCalorieEstimate on a workout domain_answer", () => {
      const answer = domainAnswerSchema.parse({
        kind: "domain_answer",
        domain: "workout",
        summary: "Lighter session.",
        candidateProposals: [],
        domainSignals: [],
        workoutCalorieEstimate: 280,
      });
      expect(answer.workoutCalorieEstimate).toBe(280);
    });

    it("rejects workoutCalorieEstimate on a nutrition domain_answer", () => {
      const result = domainLlmStepOutputSchema.safeParse({
        kind: "domain_answer",
        domain: "nutrition",
        summary: "Nutrition plan update.",
        candidateProposals: [],
        domainSignals: [],
        workoutCalorieEstimate: 300,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages.some((m) => m.includes("workout"))).toBe(true);
      }
    });

    it("rejects workoutCalorieEstimate on a health domain_answer", () => {
      const result = domainLlmStepOutputSchema.safeParse({
        kind: "domain_answer",
        domain: "health",
        summary: "General health response.",
        candidateProposals: [],
        domainSignals: [],
        workoutCalorieEstimate: 150,
      });
      expect(result.success).toBe(false);
    });

    it("validates that the domain LLM step forbidden-key guard catches extra user-facing fields", () => {
      const errors = validateDomainLlmStepOutputShape({
        kind: "domain_answer",
        domain: "workout",
        summary: "Good.",
        candidateProposals: [],
        domainSignals: [],
        reply: "Do not include me",
      });
      expect(errors.some((e) => e.includes('"reply"'))).toBe(true);
    });
  });

  describe("workoutPlanPayloadSchema: calorie fields structural safety", () => {
    it("accepts a payload without calorie fields (default case — no estimate available)", () => {
      const payload = workoutPlanPayloadSchema.parse({
        title: "Base plan",
        summary: "No calorie estimate.",
        days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
        notes: [],
      });
      expect(payload.estimatedSessionCalorieBurn).toBeUndefined();
      expect(payload.calorieEstimateProvenance).toBeUndefined();
    });

    it("strips any key not defined in the schema including hypothetical decision_maker_estimate", () => {
      // This test proves that a decision-maker that tries to add an unrecognised calorie
      // field cannot smuggle it through workoutPlanPayloadSchema.parse.
      const parsed = workoutPlanPayloadSchema.parse({
        title: "Plan",
        summary: "Summary.",
        days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
        notes: [],
        decision_maker_estimate: 999, // fabricated key — must be stripped
      });
      expect((parsed as Record<string, unknown>)["decision_maker_estimate"]).toBeUndefined();
    });

    it("rejects a session calorie estimate that exceeds the schema ceiling of 20 000 kcal", () => {
      expect(() =>
        workoutPlanPayloadSchema.parse({
          title: "Plan",
          summary: "Over ceiling.",
          days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
          notes: [],
          estimatedSessionCalorieBurn: 20001,
          calorieEstimateProvenance: "workout_llm",
        }),
      ).toThrow();
    });

    it("rejects a negative session calorie estimate", () => {
      expect(() =>
        workoutPlanPayloadSchema.parse({
          title: "Plan",
          summary: "Negative.",
          days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
          notes: [],
          estimatedSessionCalorieBurn: -1,
          calorieEstimateProvenance: "workout_llm",
        }),
      ).toThrow();
    });
  });

  describe("getWorkoutProposalDomainErrors: provenance co-presence enforcement", () => {
    const baseChanges = workoutPlanProposalChangesSchema.parse({
      title: "Plan",
      summary: "Weekly.",
      // B6 removal: string exercises removed.
      days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
      notes: [],
    });

    it("requires calorieEstimateProvenance when estimatedSessionCalorieBurn is present", () => {
      // This is the code-level floor that prevents any LLM or code path from setting
      // estimatedSessionCalorieBurn without declaring who set it.
      const errors = getWorkoutProposalDomainErrors({
        ...baseChanges,
        estimatedSessionCalorieBurn: 280,
        calorieEstimateProvenance: undefined,
      } as typeof baseChanges);

      expect(errors.some((e) => e.includes("calorieEstimateProvenance"))).toBe(true);
    });

    it("requires estimatedSessionCalorieBurn when calorieEstimateProvenance is present", () => {
      // A dangling provenance without an actual value must also be rejected.
      const errors = getWorkoutProposalDomainErrors({
        ...baseChanges,
        estimatedSessionCalorieBurn: undefined,
        calorieEstimateProvenance: "workout_llm" as const,
      } as typeof baseChanges);

      expect(errors.some((e) => e.includes("calorieEstimateProvenance"))).toBe(true);
    });

    it("accepts both fields absent (no estimate provided this turn)", () => {
      const errors = getWorkoutProposalDomainErrors(baseChanges);
      expect(errors).toEqual([]);
    });

    it("accepts workout_llm provenance with a valid estimate (ActionResolver output)", () => {
      const errors = getWorkoutProposalDomainErrors({
        ...baseChanges,
        estimatedSessionCalorieBurn: 280,
        calorieEstimateProvenance: "workout_llm",
      });
      expect(errors).toEqual([]);
    });

    it("accepts user_manual provenance (user override path)", () => {
      const errors = getWorkoutProposalDomainErrors({
        ...baseChanges,
        estimatedSessionCalorieBurn: 500,
        calorieEstimateProvenance: "user_manual",
      });
      expect(errors).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 8d — fan-out architecture safety regression suite
// Asserts the preserved code floors under the new parallel domain fan-out
// pipeline. These tests must never be weakened.
// ---------------------------------------------------------------------------

describe("Phase 8d: fan-out pipeline safety regression", () => {
  // -------------------------------------------------------------------------
  // 1. Router output: forbidden user-facing keys, selectedDomains cap, unknown
  //    domains/tools stripped.
  // -------------------------------------------------------------------------

  describe("router output is clamped and read-only (fan-out architecture)", () => {
    it("rejects router output that contains a user-visible 'reply' field", () => {
      const errors = validateRouterDecisionOutputShape({
        selectedDomains: [],
        confidence: 0.5,
        reply: "Here is your answer",
      });
      expect(errors.some((e) => e.includes('forbidden field "reply"'))).toBe(true);
    });

    it("rejects router output that contains a 'proposals' field", () => {
      const errors = validateRouterDecisionOutputShape({
        selectedDomains: [],
        confidence: 0.5,
        proposals: [{ intent: "adapt_workout_plan" }],
      });
      expect(errors.some((e) => e.includes('forbidden field "proposals"'))).toBe(true);
    });

    it("rejects router output that contains a 'tool' field", () => {
      const errors = validateRouterDecisionOutputShape({
        selectedDomains: [],
        confidence: 0.5,
        tool: "getUserContextSlice",
      });
      expect(errors.some((e) => e.includes('forbidden field "tool"'))).toBe(true);
    });

    it("rejects router output that contains a 'kind' field", () => {
      const errors = validateRouterDecisionOutputShape({
        selectedDomains: [],
        confidence: 0.5,
        kind: "final_answer",
      });
      expect(errors.some((e) => e.includes('forbidden field "kind"'))).toBe(true);
    });

    it("rejects selectedDomains > MAX_ROUTER_SELECTED_DOMAINS (3) via schema", () => {
      const result = routerDecisionOutputSchema.safeParse({
        selectedDomains: [
          { domain: "workout", confidence: 0.9, intentHints: [], toolHints: [], signalHints: [] },
          { domain: "nutrition", confidence: 0.8, intentHints: [], toolHints: [], signalHints: [] },
          { domain: "health", confidence: 0.7, intentHints: [], toolHints: [], signalHints: [] },
          { domain: "workout", confidence: 0.6, intentHints: [], toolHints: [], signalHints: [] },
        ],
        confidence: 0.9,
      });
      expect(result.success).toBe(false);
    });

    it("clampRouterDecisionOutput caps selectedDomains to MAX_ROUTER_SELECTED_DOMAINS", () => {
      // Build a valid 3-domain output (max the schema allows) and verify the clamp
      // respects the constant even when allowedDomains permits all three.
      const output = routerDecisionOutputSchema.parse({
        selectedDomains: [
          { domain: "workout", confidence: 0.9, intentHints: [], toolHints: [], signalHints: [] },
          { domain: "nutrition", confidence: 0.8, intentHints: [], toolHints: [], signalHints: [] },
          { domain: "health", confidence: 0.7, intentHints: [], toolHints: [], signalHints: [] },
        ],
        confidence: 0.9,
      });

      const clamped = clampRouterDecisionOutput(output);
      expect(clamped.selectedDomains.length).toBeLessThanOrEqual(MAX_ROUTER_SELECTED_DOMAINS);
    });

    it("clampRouterDecisionOutput strips unknown/disallowed domains", () => {
      const output = routerDecisionOutputSchema.parse({
        selectedDomains: [
          { domain: "workout", confidence: 0.9, intentHints: [], toolHints: [], signalHints: [] },
          { domain: "nutrition", confidence: 0.8, intentHints: [], toolHints: [], signalHints: [] },
        ],
        confidence: 0.9,
      });

      // Only permit the workout domain — nutrition must be stripped.
      const clamped = clampRouterDecisionOutput(output, new Set(["workout"]));
      expect(clamped.selectedDomains).toHaveLength(1);
      expect(clamped.selectedDomains[0]?.domain).toBe("workout");
    });

    it("clampRouterDecisionOutput strips toolHints not in the allowed tools set", () => {
      const output = routerDecisionOutputSchema.parse({
        selectedDomains: [
          {
            domain: "workout",
            confidence: 0.8,
            intentHints: [],
            toolHints: ["getUserContextSlice", "getWeeklyProgressContext"],
            signalHints: [],
          },
        ],
        confidence: 0.8,
      });

      const clamped = clampRouterDecisionOutput(
        output,
        new Set(["workout", "nutrition", "health"]),
        new Set(["getUserContextSlice"]),
      );
      // getWeeklyProgressContext must be stripped
      expect(clamped.selectedDomains[0]?.toolHints).toEqual(["getUserContextSlice"]);
      expect(clamped.selectedDomains[0]?.toolHints).not.toContain("getWeeklyProgressContext");
    });

    it("rejects an unknown domain name in selectedDomains (e.g. 'medical')", () => {
      const result = routerDecisionOutputSchema.safeParse({
        selectedDomains: [
          { domain: "medical", confidence: 0.9, intentHints: [], toolHints: [], signalHints: [] },
        ],
        confidence: 0.9,
      });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Per-domain allowlist: a domain LLM cannot use another domain's tools or
  //    proposals; YAML can only NARROW the catalog, never widen.
  // -------------------------------------------------------------------------

  describe("per-domain allowlist: YAML can only narrow catalog, never widen", () => {
    it("intersectDomainConfigWithCatalog drops a tool not in the catalog", () => {
      const warnings: string[] = [];
      const config: DomainConfig = {
        domain: "workout",
        llmId: "workout_coach",
        intents: [],
        tools: ["getUserContextSlice", "dangerousWriteTool" as never],
        safetyNotes: [],
      };

      const result = intersectDomainConfigWithCatalog(config, warnings);
      expect(result.tools).toEqual(["getUserContextSlice"]);
      expect(warnings.some((w) => w.includes("dangerousWriteTool"))).toBe(true);
      expect(warnings.some((w) => w.includes("dropped"))).toBe(true);
    });

    it("intersectDomainConfigWithCatalog drops an intent whose mapsToCapabilityId is not in the catalog", () => {
      const warnings: string[] = [];
      const config: DomainConfig = {
        domain: "nutrition",
        llmId: "nutrition_coach",
        intents: [
          {
            id: "fake_intent",
            description: "This maps to a non-existent capability.",
            mapsToCapabilityId: "not_a_real_capability_id" as never,
          },
          {
            id: "real_intent",
            description: "Log food.",
            mapsToCapabilityId: "adjust_nutrition",
          },
        ],
        tools: ["getUserContextSlice"],
        safetyNotes: [],
      };

      const result = intersectDomainConfigWithCatalog(config, warnings);
      expect(result.intents).toHaveLength(1);
      expect(result.intents[0]?.id).toBe("real_intent");
      expect(warnings.some((w) => w.includes("not_a_real_capability_id"))).toBe(true);
    });

    it("YAML with empty tools stays empty — catalog intersection cannot widen the set", () => {
      const warnings: string[] = [];
      const config: DomainConfig = {
        domain: "workout",
        llmId: "workout_coach",
        intents: [],
        tools: [],
        safetyNotes: [],
      };

      const result = intersectDomainConfigWithCatalog(config, warnings);
      // No tools were declared, so the intersection is empty — catalog tools are NOT injected.
      expect(result.tools).toEqual([]);
    });

    it("workout capability allowedTools does not include getDocumentContext (cross-domain tool isolation)", () => {
      const workoutCapability = getCapabilityConfig("adjust_workout");
      expect(workoutCapability.allowedTools).not.toContain("getDocumentContext");
    });

    it("nutrition capability allowedTools does not include getDocumentContext (cross-domain tool isolation)", () => {
      const nutritionCapability = getCapabilityConfig("adjust_nutrition");
      expect(nutritionCapability.allowedTools).not.toContain("getDocumentContext");
    });

    it("workout capability allowedProposals does not include nutrition plan intents", () => {
      const workoutCapability = getCapabilityConfig("adjust_workout");
      const nutritionProposals = ["create_nutrition_plan", "adjust_nutrition_plan"];
      for (const nutritionProposal of nutritionProposals) {
        expect(workoutCapability.allowedProposals).not.toContain(nutritionProposal);
      }
    });

    it("domain LLM step output with a forbidden 'reply' field is caught by the shape guard", () => {
      // A domain LLM must emit domain_answer, not a direct user reply.
      const errors = validateDomainShape({
        kind: "domain_answer",
        domain: "nutrition",
        summary: "Meal advice.",
        candidateProposals: [],
        domainSignals: [],
        reply: "Here is your meal plan!",
      });
      expect(errors.some((e) => e.includes('forbidden field "reply"'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Decision-maker reply passes validateReplySafety — diagnosis/treatment
  //    language is structurally blocked on the fan-out path.
  //    NOTE: validateReplySafety lives in packages/ai/src/safety.ts and is
  //    imported by the service layer. Here we test the FinalDecisionOutput
  //    schema does not embed unsafe wording and that the shape guard blocks
  //    unexpected fields that could smuggle unsafe content.
  // -------------------------------------------------------------------------

  describe("decision-maker reply safety on the fan-out path", () => {
    it("validateFinalDecisionOutputShape rejects output with forbidden 'advice' field", () => {
      const errors = validateFinalDecisionOutputShape({
        reply: "Here is your plan.",
        advice: "You should take medication",
      });
      expect(errors.some((e) => e.includes('forbidden field "advice"'))).toBe(true);
    });

    it("validateFinalDecisionOutputShape rejects output with forbidden 'recommendation' field", () => {
      const errors = validateFinalDecisionOutputShape({
        reply: "Here is your plan.",
        recommendation: "Take this supplement daily",
      });
      expect(errors.some((e) => e.includes('forbidden field "recommendation"'))).toBe(true);
    });

    it("validateFinalDecisionOutputShape rejects output with forbidden 'domain' field (domain LLM bleed-through)", () => {
      const errors = validateFinalDecisionOutputShape({
        reply: "Here is your plan.",
        domain: "workout",
      });
      expect(errors.some((e) => e.includes('forbidden field "domain"'))).toBe(true);
    });

    it("validateFinalDecisionOutputShape rejects output with forbidden 'summary' field (domain LLM bleed-through)", () => {
      const errors = validateFinalDecisionOutputShape({
        reply: "Here is your plan.",
        summary: "Internal domain summary not for users",
      });
      expect(errors.some((e) => e.includes('forbidden field "summary"'))).toBe(true);
    });

    it("FinalDecisionOutput has no estimatedSessionCalorieBurn field — calorie provenance floor", () => {
      // The decision-maker MUST NOT be able to set a calorie estimate. The schema
      // does not expose this field, so any attempt to add it must be caught.
      const parsed = finalDecisionOutputSchema.parse({
        reply: "Here is your plan.",
        estimatedSessionCalorieBurn: 500,
        calorieEstimateProvenance: "workout_llm",
      });

      // Zod strips unknown keys unless .strict() is used. The point here is that the
      // decision-maker output schema does NOT expose calorie fields — consumers
      // cannot read them from this layer.
      expect((parsed as Record<string, unknown>)["estimatedSessionCalorieBurn"]).toBeUndefined();
      expect((parsed as Record<string, unknown>)["calorieEstimateProvenance"]).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Consent-gated medical save NEVER auto-persists a health_documents row.
  //    The medical_document_save action must yield consentRequired=true and
  //    proposals must not directly create health_documents.
  // -------------------------------------------------------------------------

  describe("consent-gated medical save never auto-persists health_documents", () => {
    it("FinalDecisionOutput consentRequired=true is accepted and signals consent gate", () => {
      const parsed = finalDecisionOutputSchema.parse({
        reply: "I found relevant health context. Do you consent to saving it as a document?",
        consentRequired: true,
        proposals: [],
      });
      expect(parsed.consentRequired).toBe(true);
    });

    it("FinalDecisionOutput consentRequired=false is the default (no implicit consent)", () => {
      const parsed = finalDecisionOutputSchema.parse({
        reply: "Here is your workout adjustment.",
      });
      expect(parsed.consentRequired).toBe(false);
    });

    it("medicalDocumentPersistenceStatusSchema only allows 'attachment_context_only' (not a health_documents row)", () => {
      // This is the only valid persistence status for new writes.
      // 'saved_health_document' is the legacy schema and must not be the new write value.
      expect(medicalDocumentPersistenceStatusSchema.parse("attachment_context_only")).toBe(
        "attachment_context_only",
      );
      expect(() => medicalDocumentPersistenceStatusSchema.parse("saved_health_document")).toThrow();
      expect(() => medicalDocumentPersistenceStatusSchema.parse("auto_persisted")).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 6. Calorie provenance floor: estimatedSessionCalorieBurn only from
  //    workout domain (workout_llm) or user edits (user_manual).
  //    Decision-maker/nutrition LLM cannot set it.
  //    (Existing Phase 6 tests already cover most of this — these add fan-out
  //    specific cases.)
  // -------------------------------------------------------------------------

  describe("calorie provenance floor — fan-out specific cases", () => {
    it("nutrition domain answer cannot carry workoutCalorieEstimate", () => {
      const result = domainLlmStepOutputSchema.safeParse({
        kind: "domain_answer",
        domain: "nutrition",
        summary: "Here is a calorie breakdown.",
        candidateProposals: [],
        domainSignals: [],
        workoutCalorieEstimate: 450,
      });
      expect(result.success).toBe(false);
    });

    it("health domain answer cannot carry workoutCalorieEstimate", () => {
      const result = domainLlmStepOutputSchema.safeParse({
        kind: "domain_answer",
        domain: "health",
        summary: "General health context.",
        candidateProposals: [],
        domainSignals: [],
        workoutCalorieEstimate: 300,
      });
      expect(result.success).toBe(false);
    });

    it("workout domain answer CAN carry workoutCalorieEstimate (only valid source)", () => {
      const parsed = domainAnswerSchema.parse({
        kind: "domain_answer",
        domain: "workout",
        summary: "Lighter session suggested.",
        candidateProposals: [],
        domainSignals: [],
        workoutCalorieEstimate: 280,
      });
      expect(parsed.workoutCalorieEstimate).toBe(280);
    });

    it("FinalDecisionOutput (decision-maker) has no workoutCalorieEstimate field — decision-maker cannot set calories", () => {
      // The decision-maker output schema has no calorie field; any value passed in must be stripped.
      const parsed = finalDecisionOutputSchema.parse({
        reply: "Workout adjusted.",
        workoutCalorieEstimate: 500,
      });
      expect((parsed as Record<string, unknown>)["workoutCalorieEstimate"]).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 7. Document/sensitive context denied by default per domain packet;
  //    getDocumentContext expansion requests are blocked by the budget floor.
  // -------------------------------------------------------------------------

  describe("per-domain context budget floors: documents and sensitive health denied by default", () => {
    it("DEFAULT_CONTEXT_BUDGET_POLICY denies documents and sensitive health out of the box", () => {
      expect(DEFAULT_CONTEXT_BUDGET_POLICY.allowDocuments).toBe(false);
      expect(DEFAULT_CONTEXT_BUDGET_POLICY.allowSensitiveHealthContext).toBe(false);
    });

    it("applyContextBudgetSafetyFloor forces documents and sensitive health off regardless of input", () => {
      const forcedOn = applyContextBudgetSafetyFloor({
        ...DEFAULT_CONTEXT_BUDGET_POLICY,
        allowDocuments: true,
        allowSensitiveHealthContext: true,
      });
      expect(forcedOn.allowDocuments).toBe(false);
      expect(forcedOn.allowSensitiveHealthContext).toBe(false);
    });

    it("clampContextBudgetPolicy overrides allowDocuments=true to false (code-level floor)", () => {
      const clamped = clampContextBudgetPolicy({
        ...DEFAULT_CONTEXT_BUDGET_POLICY,
        allowDocuments: true,
        allowSensitiveHealthContext: true,
      });
      expect(clamped.allowDocuments).toBe(false);
      expect(clamped.allowSensitiveHealthContext).toBe(false);
    });

    it("context expansion request with includeDocuments=true is denied when policy disallows documents", () => {
      const result = evaluateContextExpansionRequest({
        budget: {
          ...DEFAULT_CONTEXT_BUDGET_POLICY,
          maxExpansionRounds: 2,
          maxSlicesPerExpansionRound: 2,
        },
        request: {
          roundIndex: 0,
          reason: "Need medical document context for health domain.",
          requestedSlices: [
            {
              type: "health_context",
              includeDocuments: true,
            },
          ],
        },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("Document expansion"))).toBe(true);
      }
    });

    it("context expansion request without documents is approved under default budget", () => {
      const result = evaluateContextExpansionRequest({
        budget: {
          ...DEFAULT_CONTEXT_BUDGET_POLICY,
          maxExpansionRounds: 2,
          maxSlicesPerExpansionRound: 2,
        },
        request: {
          roundIndex: 0,
          reason: "Need workout context.",
          requestedSlices: [
            {
              type: "workout_adaptation",
              depth: "medium",
            },
          ],
        },
      });

      expect(result.ok).toBe(true);
    });

    it("per-domain context budget respects the absolute numeric limits", () => {
      const clamped = clampContextBudgetPolicy({
        ...DEFAULT_CONTEXT_BUDGET_POLICY,
        maxSlices: CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlices + 99,
        maxRawItems: CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxRawItems + 99,
        maxLookbackDays: CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxLookbackDays + 99,
      });
      expect(clamped.maxSlices).toBe(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlices);
      expect(clamped.maxRawItems).toBe(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxRawItems);
      expect(clamped.maxLookbackDays).toBe(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxLookbackDays);
    });
  });

  // ---------------------------------------------------------------------------
  // Slice C6 — proposal validation failure classification
  // ---------------------------------------------------------------------------

  describe("proposal validation failure classification (Slice C6)", () => {
    it("proposalValidationFailureClassSchema accepts all five classes", () => {
      for (const cls of ["safety", "schema", "ownership", "unsupported-intent", "other"] as const) {
        expect(proposalValidationFailureClassSchema.parse(cls)).toBe(cls);
      }
    });

    it("classifies safety errors with highest priority", () => {
      expect(
        classifyProposalValidationFailure({
          safetyErrors: ["Unsafe medical wording detected"],
          schemaErrors: ["Field missing"],
          ownershipErrors: ["Resource not owned"],
        }),
      ).toBe("safety");
    });

    it("classifies schema errors when safety is clean", () => {
      expect(
        classifyProposalValidationFailure({
          safetyErrors: [],
          schemaErrors: ["proposedChanges: Required"],
          ownershipErrors: [],
        }),
      ).toBe("schema");
    });

    it("classifies ownership errors when safety and schema are clean", () => {
      expect(
        classifyProposalValidationFailure({
          safetyErrors: [],
          schemaErrors: [],
          ownershipErrors: ["sourceSummaryId: Weekly progress summary was not found"],
        }),
      ).toBe("ownership");
    });

    it("classifies unsupported-intent errors when safety, schema, and ownership are clean", () => {
      expect(
        classifyProposalValidationFailure({
          safetyErrors: [],
          schemaErrors: [],
          ownershipErrors: [],
          unsupportedIntentErrors: ["Intent not supported in active catalog"],
        }),
      ).toBe("unsupported-intent");
    });

    it("classifies as 'other' when all buckets are empty (defensive)", () => {
      expect(
        classifyProposalValidationFailure({
          safetyErrors: [],
          schemaErrors: [],
          ownershipErrors: [],
        }),
      ).toBe("other");
    });

    it("safety takes priority over schema even when both have errors", () => {
      const result = classifyProposalValidationFailure({
        safetyErrors: ["unsafe"],
        schemaErrors: ["malformed"],
        ownershipErrors: ["missing resource"],
        unsupportedIntentErrors: ["unsupported"],
      });

      expect(result).toBe("safety");
    });

    it("schema takes priority over ownership", () => {
      expect(
        classifyProposalValidationFailure({
          safetyErrors: [],
          schemaErrors: ["parse error"],
          ownershipErrors: ["not owned"],
        }),
      ).toBe("schema");
    });

    it("ownership takes priority over unsupported-intent", () => {
      expect(
        classifyProposalValidationFailure({
          safetyErrors: [],
          schemaErrors: [],
          ownershipErrors: ["not found"],
          unsupportedIntentErrors: ["unsupported"],
        }),
      ).toBe("ownership");
    });
  });
});
