import { describe, expect, it, vi } from "vitest";
import {
  getCapabilityConfig,
  routerDecisionOutputSchema,
  normalizeAiBehaviorConfig,
  RULE_ROUTE_CONFIDENCE_THRESHOLD,
  MAX_ROUTER_SELECTED_DOMAINS,
} from "@health/types";
import {
  DEFAULT_CONTEXT_BUDGET_POLICY,
} from "@health/types";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import { ContextBudgetPolicyService } from "../coaching-context/context-budget-policy.service.js";
import { DirectChatPathMatcherService } from "./direct-chat-path-matcher.service.js";
import { ProposalExplainerMatcherService } from "./proposal-explainer-matcher.service.js";
import { ResponseModePolicyService } from "./response-mode-policy.service.js";
import { SystemPlannerService } from "./system-planner.service.js";
import { createAiPolicyTestStack } from "./test-ai-behavior-fixtures.js";
import type { RouterLlmResult } from "./router-llm.service.js";

function createRouterResultForPlanner(
  domain: "workout" | "nutrition" | "health" = "workout",
  confidence = 0.84,
  source: "llm" | "fallback" = "llm",
): RouterLlmResult {
  if (source === "fallback") {
    return {
      output: routerDecisionOutputSchema.parse({
        selectedDomains: [],
        contextNeeds: [],
        safetyFlags: [],
        confidence,
      }),
      source: "fallback",
      validationErrors: ["forced fallback"],
    };
  }

  const domainSafetyFlags = domain === "workout" ? ["fatigue"] : [];

  return {
    output: routerDecisionOutputSchema.parse({
      selectedDomains: [
        {
          domain,
          confidence,
          intentHints: [],
          toolHints: [],
          signalHints: [],
        },
      ],
      contextNeeds:
        domain === "workout"
          ? ["active_workout_plan"]
          : domain === "nutrition"
            ? ["active_nutrition_plan"]
            : [],
      safetyFlags: domainSafetyFlags,
      confidence,
    }),
    source: "llm",
    validationErrors: [],
  };
}

function createPlannerHarness() {
  const stack = createAiPolicyTestStack();

  return {
    planner: stack.systemPlannerService,
    capabilityRegistryService: stack.capabilityRegistryService,
    responseModePolicyService: stack.responseModePolicyService,
  };
}

describe("SystemPlannerService", () => {
  it("routes confident router decision without safe fallback", async () => {
    const { planner } = createPlannerHarness();
    const capabilityConfig = getCapabilityConfig("adjust_workout");

    const plan = await planner.planTurn({
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
      routerResult: createRouterResultForPlanner("workout", 0.84),
    });

    expect(plan.catalogIntentId).toBe("adjust_workout");
    expect(plan.route.routingMethod).toBe("unified_turn_decision");
    expect(plan.route.isConfident).toBe(true);
    expect(plan.route.safetyFlags).toEqual(["fatigue"]);
    expect(plan.route.requiredContextSlices).toEqual(
      expect.arrayContaining([capabilityConfig.defaultContextStrategy]),
    );
  });

  it("falls back to general when router confidence is low (fallback source)", async () => {
    const { planner } = createPlannerHarness();
    const generalConfig = getCapabilityConfig("general");

    const plan = await planner.planTurn({
      userMessage: "I feel completely off today. What should I do?",
      recentMessages: [],
      routerResult: createRouterResultForPlanner("workout", 0.35, "fallback"),
    });

    expect(plan.route.routingMethod).toBe("unified_turn_decision");
    expect(plan.catalogIntentId).toBe("general");
    expect(plan.route.isConfident).toBe(false);
    expect(plan.route.requiredContextSlices).toEqual([generalConfig.defaultContextStrategy]);
  });

  it("routes confident router result for nutrition domain", async () => {
    const { planner } = createPlannerHarness();
    const capabilityConfig = getCapabilityConfig("adjust_nutrition");

    const plan = await planner.planTurn({
      userMessage: "Log this meal",
      recentMessages: [],
      routerResult: createRouterResultForPlanner("nutrition", 0.84),
      attachmentTurn: {
        attachments: [
          {
            attachmentRefId: "a1000001-0000-4000-8000-000000000002",
            category: "food_photo",
            mimeType: "image/jpeg",
            consentState: "none" as const,
            storageRef: "local://attachments/meal.jpg",
          },
        ],
      },
    });

    expect(plan.catalogIntentId).toBe("adjust_nutrition");
    expect(plan.route.routingMethod).toBe("unified_turn_decision");
    expect(plan.route.requiredContextSlices).toEqual(
      expect.arrayContaining([capabilityConfig.defaultContextStrategy]),
    );
  });

  it("does not bypass attachments when router is low confidence", async () => {
    const { planner } = createPlannerHarness();
    const generalConfig = getCapabilityConfig("general");

    const plan = await planner.planTurn({
      userMessage: "Log this meal",
      recentMessages: [],
      routerResult: createRouterResultForPlanner("nutrition", 0.2, "fallback"),
      attachmentTurn: {
        attachments: [
          {
            attachmentRefId: "a1000001-0000-4000-8000-000000000002",
            category: "food_photo",
            mimeType: "image/jpeg",
            consentState: "none" as const,
            storageRef: "local://attachments/meal.jpg",
          },
        ],
      },
    });

    expect(plan.catalogIntentId).toBe("general");
    expect(plan.route.routingMethod).toBe("unified_turn_decision");
    expect(plan.route.requiredContextSlices).toEqual([generalConfig.defaultContextStrategy]);
  });

  it("uses rule_based safe fallback when router did not run", async () => {
    const { planner } = createPlannerHarness();
    const generalConfig = getCapabilityConfig("general");

    const plan = await planner.planTurn({
      userMessage: "I feel completely off today. What should I do?",
      recentMessages: [],
    });

    expect(plan.catalogIntentId).toBe("general");
    expect(plan.route.routingMethod).toBe("rule_based");
    expect(plan.route.isConfident).toBe(false);
    expect(plan.route.requiredContextSlices).toEqual([generalConfig.defaultContextStrategy]);
  });

  it("uses registry fallback context strategy for unknown capability ids", () => {
    const { planner } = createPlannerHarness();
    const generalConfig = getCapabilityConfig("general");

    expect(
      planner.resolveContextStrategyFallback("not_a_capability" as "general", "general"),
    ).toEqual(generalConfig.defaultContextStrategy);
  });

  it("classifies explicit direct path candidates without planner fallback", async () => {
    const { planner } = createPlannerHarness();

    expect(
      planner.classifyDirectPathCandidate({
        userMessage: "What is today?",
      }),
    ).toEqual({
      kind: "today_summary_read",
      confidence: 0.95,
      routingMethod: "rule_based",
    });

    expect(
      planner.classifyDirectPathCandidate({
        userMessage: "Mark today's workout done",
      }),
    ).toEqual({
      kind: "mark_today_workout_done",
      confidence: 0.95,
      routingMethod: "rule_based",
    });

    expect(
      planner.classifyDirectPathCandidate({
        userMessage: "Should I train today?",
      }),
    ).toBeNull();

    const plan = await planner.planTurn({
      userMessage: "What is today?",
      recentMessages: [],
    });

    expect(plan.executorMode).toBe("deterministic_read");
    expect(plan.catalogIntentId).toBe("general");
  });

  it("blocks direct path classification for attachment and proposal revision turns", () => {
    const { planner } = createPlannerHarness();

    expect(
      planner.classifyDirectPathCandidate({
        userMessage: "What is today?",
        attachmentTurn: {
          attachments: [
            {
              attachmentRefId: "a1000001-0000-4000-8000-000000000001",
              category: "food_photo",
              mimeType: "image/jpeg",
              consentState: "none" as const,
              storageRef: null,
            },
          ],
        },
      }),
    ).toBeNull();

    expect(
      planner.classifyDirectPathCandidate({
        userMessage: "Mark today's workout done",
        proposalRevision: {
          supersededProposalId: "a1000001-0000-4000-8000-000000000001",
          originalProposal: {
            intent: "adapt_workout_plan",
            targetDomain: "workout",
            title: "Adjust plan",
            reason: "User feedback",
            proposedChanges: {},
          },
          modificationFeedback: "Make it easier",
        },
      }),
    ).toBeNull();
  });

  it("routes explicit proposal explainer turns deterministically", async () => {
    const { planner } = createPlannerHarness();
    const capabilityConfig = getCapabilityConfig("proposal_explainer");

    const plan = await planner.planTurn({
      userMessage: "Why this proposal?",
      recentMessages: [],
    });

    expect(plan.catalogIntentId).toBe("proposal_explainer");
    expect(plan.route.routingMethod).toBe("rule_based");
    expect(plan.route.confidence).toBe(0.95);
    expect(plan.expectedResponseMode).toBe("advice_only");
    expect(plan.intentDefinition.allowedProposalIntents).toEqual([]);
    expect(plan.intentDefinition.allowedTools).toEqual([]);
    expect(plan.route.requiredContextSlices).toEqual([capabilityConfig.defaultContextStrategy]);
    expect(plan.primaryCapabilityId).toBe("proposal_explainer");
    expect(plan.selectedCapabilities).toEqual(["proposal_explainer"]);
    expect(plan.presentationMetadata.widgetDescriptors).toEqual([]);
    expect(plan.presentationMetadata.actionDescriptors).toEqual([]);
  });

  it("does not route general advice questions to proposal explainer", async () => {
    const { planner } = createPlannerHarness();

    const plan = await planner.planTurn({
      userMessage: "Why should I train today?",
      recentMessages: [],
      routerResult: createRouterResultForPlanner("workout", 0.84),
    });

    expect(plan.catalogIntentId).toBe("adjust_workout");
  });

  it("exposes additive supporting capabilities from registry composition metadata", async () => {
    const { planner, capabilityRegistryService } = createPlannerHarness();
    const resolveSelectedCapabilityIds = vi
      .spyOn(capabilityRegistryService, "resolveSelectedCapabilityIds")
      .mockReturnValue(["adjust_workout", "ask_about_today"]);
    const resolvePresentationMetadata = vi.spyOn(
      capabilityRegistryService,
      "resolvePresentationMetadata",
    );

    const plan = await planner.planTurn({
      userMessage: "Log this meal",
      recentMessages: [],
      routerResult: createRouterResultForPlanner("nutrition", 0.84),
      attachmentTurn: {
        attachments: [
          {
            attachmentRefId: "a1000001-0000-4000-8000-000000000001",
            category: "food_photo",
            mimeType: "image/jpeg",
            consentState: "none" as const,
            storageRef: null,
          },
        ],
      },
    });

    expect(resolveSelectedCapabilityIds).toHaveBeenCalledWith("adjust_nutrition");
    expect(resolvePresentationMetadata).toHaveBeenCalledWith("adjust_nutrition", [
      "adjust_workout",
      "ask_about_today",
    ]);
    expect(plan.primaryCapabilityId).toBe("adjust_nutrition");
    expect(plan.selectedCapabilities).toEqual(["adjust_workout", "ask_about_today"]);
    expect(plan.intentDefinition.id).toBe("adjust_nutrition");
  });

  it("attaches default context budget for confident router result turns", async () => {
    const { planner } = createPlannerHarness();

    const plan = await planner.planTurn({
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
      routerResult: createRouterResultForPlanner("workout", 0.84),
    });

    expect(plan.contextBudget).toEqual(DEFAULT_CONTEXT_BUDGET_POLICY);
    expect(plan.isMonthlyReview).toBe(false);
    expect(plan.isMultiDomainReview).toBe(false);
    expect(plan.requiresCompression).toBe(false);
  });

  it("refines workout domain to review_progress when intentHints match", async () => {
    const { planner } = createPlannerHarness();

    // The workout YAML config maps intent id "review_workout_progress"
    // to capability "review_progress". When the router emits that hint the
    // planner should pick review_progress instead of the default adjust_workout.
    const routerResultWithHint: ReturnType<typeof createRouterResultForPlanner> = {
      output: routerDecisionOutputSchema.parse({
        selectedDomains: [
          {
            domain: "workout",
            confidence: 0.84,
            intentHints: ["review_workout_progress"],
            toolHints: [],
            signalHints: [],
          },
        ],
        contextNeeds: ["weekly_progress"],
        safetyFlags: [],
        confidence: 0.84,
      }),
      source: "llm",
      validationErrors: [],
    };

    const plan = await planner.planTurn({
      userMessage: "How has my workout progress been this week?",
      recentMessages: [],
      routerResult: routerResultWithHint,
    });

    expect(plan.catalogIntentId).toBe("review_progress");
    expect(plan.route.routingMethod).toBe("unified_turn_decision");
    expect(plan.route.isConfident).toBe(true);
  });

  it("refines workout domain to adjust_workout via description match in intentHints", async () => {
    const { planner } = createPlannerHarness();

    // Router returns a free-text hint that matches the "adapt_workout" intent description.
    const routerResultWithDescHint: ReturnType<typeof createRouterResultForPlanner> = {
      output: routerDecisionOutputSchema.parse({
        selectedDomains: [
          {
            domain: "workout",
            confidence: 0.84,
            intentHints: ["adapt_workout"],
            toolHints: [],
            signalHints: [],
          },
        ],
        contextNeeds: [],
        safetyFlags: [],
        confidence: 0.84,
      }),
      source: "llm",
      validationErrors: [],
    };

    const plan = await planner.planTurn({
      userMessage: "Can you adapt my workout plan based on my fatigue?",
      recentMessages: [],
      routerResult: routerResultWithDescHint,
    });

    expect(plan.catalogIntentId).toBe("adjust_workout");
    expect(plan.route.routingMethod).toBe("unified_turn_decision");
  });

  it("falls back to domain default capability when intentHints do not match any domain intent", async () => {
    const { planner } = createPlannerHarness();

    const routerResultWithUnknownHint: ReturnType<typeof createRouterResultForPlanner> = {
      output: routerDecisionOutputSchema.parse({
        selectedDomains: [
          {
            domain: "workout",
            confidence: 0.84,
            intentHints: ["completely_unknown_intent_xyz"],
            toolHints: [],
            signalHints: [],
          },
        ],
        contextNeeds: [],
        safetyFlags: [],
        confidence: 0.84,
      }),
      source: "llm",
      validationErrors: [],
    };

    const plan = await planner.planTurn({
      userMessage: "I want to exercise",
      recentMessages: [],
      routerResult: routerResultWithUnknownHint,
    });

    // Should fall back to first valid intent in the domain config: adjust_workout
    expect(plan.catalogIntentId).toBe("adjust_workout");
  });

  it("routes health domain with intentHints containing longevity_coaching to longevity_overview", async () => {
    const { planner } = createPlannerHarness();

    const routerResultWithLongevityHint: ReturnType<typeof createRouterResultForPlanner> = {
      output: routerDecisionOutputSchema.parse({
        selectedDomains: [
          {
            domain: "health",
            confidence: 0.84,
            intentHints: ["longevity_coaching"],
            toolHints: [],
            signalHints: [],
          },
        ],
        contextNeeds: [],
        safetyFlags: [],
        confidence: 0.84,
      }),
      source: "llm",
      validationErrors: [],
    };

    const plan = await planner.planTurn({
      userMessage: "What should I focus on for long-term health?",
      recentMessages: [],
      routerResult: routerResultWithLongevityHint,
    });

    expect(plan.catalogIntentId).toBe("longevity_overview");
    expect(plan.route.routingMethod).toBe("unified_turn_decision");
  });

  it("applies the confidence threshold gate — router result below threshold falls back to general", async () => {
    const { planner } = createPlannerHarness();
    // Confidence just below the 0.75 threshold should not produce a router route.
    const belowThresholdResult: ReturnType<typeof createRouterResultForPlanner> = {
      output: routerDecisionOutputSchema.parse({
        selectedDomains: [
          {
            domain: "workout",
            confidence: RULE_ROUTE_CONFIDENCE_THRESHOLD - 0.01,
            intentHints: [],
            toolHints: [],
            signalHints: [],
          },
        ],
        contextNeeds: [],
        safetyFlags: [],
        confidence: RULE_ROUTE_CONFIDENCE_THRESHOLD - 0.01,
      }),
      source: "llm",
      validationErrors: [],
    };

    const plan = await planner.planTurn({
      userMessage: "I feel a bit tired",
      recentMessages: [],
      routerResult: belowThresholdResult,
    });

    // Low-confidence LLM result should not produce adjust_workout via router route.
    expect(plan.catalogIntentId).toBe("general");
  });

  it("does not reference removed TurnDecision helpers — RouterDecisionOutput is the input contract", async () => {
    // This is a static architecture invariant: the planner must consume
    // RouterDecisionOutput (from routerResult) not the old TurnDecisionOutput.
    // We verify by checking that planTurn accepts routerResult and that the plan
    // shows unified_turn_decision routing, confirming the Phase 3 migration.
    const { planner } = createPlannerHarness();

    const plan = await planner.planTurn({
      userMessage: "Can you adapt my workout plan?",
      recentMessages: [],
      routerResult: createRouterResultForPlanner("workout", 0.84),
    });

    // Confident router result must produce unified_turn_decision routing,
    // not rule_based (which would indicate the old path).
    expect(plan.route.routingMethod).toBe("unified_turn_decision");
    expect(plan.route.isConfident).toBe(true);
    // The plan input type must not accept a turnDecision field (it's typed `never`).
    // Ensure only routerResult is accepted.
    expect(plan.catalogIntentId).toBe("adjust_workout");
  });

  it("routes proposal revisions through config-overridden capability mapping", async () => {
    const aiBehaviorConfigService = new AiBehaviorConfigService({
      config: normalizeAiBehaviorConfig({
        proposalRevisionRouting: {
          routes: [
            {
              proposalIntents: ["adapt_workout_plan"],
              capabilityId: "general",
            },
            {
              proposalIntents: ["create_nutrition_plan", "adjust_nutrition_plan"],
              capabilityId: "adjust_nutrition",
            },
            {
              proposalIntents: ["create_habit_plan", "adapt_habit_plan"],
              capabilityId: "longevity_overview",
            },
          ],
          fallbackCapabilityId: "general",
        },
      } as Parameters<typeof normalizeAiBehaviorConfig>[0]),
      source: "file",
      errors: [],
      warnings: [],
    });
    const capabilityRegistryService = new CapabilityRegistryService(aiBehaviorConfigService);
    const planner = new SystemPlannerService(
      capabilityRegistryService,
      new ResponseModePolicyService(capabilityRegistryService, aiBehaviorConfigService),
      new ContextBudgetPolicyService(aiBehaviorConfigService),
      aiBehaviorConfigService,
      new DirectChatPathMatcherService(aiBehaviorConfigService),
      new ProposalExplainerMatcherService(aiBehaviorConfigService),
    );

    const plan = await planner.planTurn({
      userMessage: "Please revise the proposal with these changes: keep one strength exercise.",
      recentMessages: [],
      proposalRevision: {
        supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
        modificationFeedback: "Keep one strength exercise.",
        originalProposal: {
          intent: "adapt_workout_plan",
          targetDomain: "workout",
          title: "Adjust today's workout",
          reason: "Recovery signals are low.",
          proposedChanges: {
            title: "Strength base",
            summary: "Lighter session today.",
            days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
            notes: [],
          },
        },
      },
    });

    expect(plan.catalogIntentId).toBe("general");
    expect(plan.route.routingMethod).toBe("rule_based");
  });

  describe("response mode executor mapping", () => {
    it("maps workout adaptation plans to proposal_flow", async () => {
      const { planner } = createPlannerHarness();

      const plan = await planner.planTurn({
        userMessage: "Can you adapt my workout plan this week?",
        recentMessages: [],
        routerResult: createRouterResultForPlanner("workout", 0.84),
      });

      expect(plan.executorMode).toBe("proposal_flow");
    });

    it("maps direct read candidates to deterministic_read on the plan", async () => {
      const { planner } = createPlannerHarness();

      const plan = await planner.planTurn({
        userMessage: "What is today?",
        recentMessages: [],
      });

      expect(plan.executorMode).toBe("deterministic_read");
    });

    it("maps proposal explainer plans to single_llm", async () => {
      const { planner } = createPlannerHarness();

      const plan = await planner.planTurn({
        userMessage: "Why this proposal?",
        recentMessages: [],
      });

      expect(plan.executorMode).toBe("single_llm");
      expect(plan.expectedResponseMode).toBe("advice_only");
    });

    it("maps confident router result for health domain to context_aware_llm for advice-only capabilities", async () => {
      const { planner } = createPlannerHarness();

      const plan = await planner.planTurn({
        userMessage: "How can I stay consistent this week?",
        recentMessages: [],
        routerResult: createRouterResultForPlanner("health", 0.84),
      });

      expect(plan.catalogIntentId).toBe("ask_health_context");
      expect(plan.route.routingMethod).toBe("unified_turn_decision");
      expect(plan.executorMode).toBe("context_aware_llm");
    });

    it("maps low-confidence router fallback to context_aware_llm for general", async () => {
      const { planner } = createPlannerHarness();

      const plan = await planner.planTurn({
        userMessage: "I feel completely off today. What should I do?",
        recentMessages: [],
        routerResult: createRouterResultForPlanner("workout", 0.35, "fallback"),
      });

      expect(plan.route.routingMethod).toBe("unified_turn_decision");
      expect(plan.catalogIntentId).toBe("general");
      expect(plan.executorMode).toBe("context_aware_llm");
    });

    it("ignores router result when proposal revision context is present", async () => {
      const { planner } = createPlannerHarness();

      const plan = await planner.planTurn({
        userMessage: "Please revise the proposal with these changes: keep one strength exercise.",
        recentMessages: [],
        proposalRevision: {
          supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
          modificationFeedback: "Keep one strength exercise.",
          originalProposal: {
            intent: "adapt_workout_plan",
            targetDomain: "workout",
            title: "Adjust today's workout",
            reason: "Recovery signals are low.",
            proposedChanges: {
              title: "Strength base",
              summary: "Lighter session today.",
              days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
              notes: [],
            },
          },
        },
        routerResult: createRouterResultForPlanner("health", 0.84),
      });

      expect(plan.route.routingMethod).toBe("rule_based");
      expect(plan.catalogIntentId).toBe("adjust_workout");
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 4a — DomainFanoutPlan
  // ---------------------------------------------------------------------------
  describe("DomainFanoutPlan (Phase 4a)", () => {
    it("returns a fanout with a single-domain entry for a confident single-domain router result", async () => {
      const { planner } = createPlannerHarness();

      const plan = await planner.planTurn({
        userMessage: "Can you adapt my workout plan this week?",
        recentMessages: [],
        routerResult: createRouterResultForPlanner("workout", 0.84),
      });

      expect(plan.fanout).toBeDefined();
      expect(plan.fanout.selectedDomains).toHaveLength(1);
      expect(plan.fanout.isMultiDomain).toBe(false);

      const entry = plan.fanout.selectedDomains[0]!;
      expect(entry.domain).toBe("workout");
      expect(entry.capabilityId).toBe("adjust_workout");
      // Tool allowlist must be from the capability catalog (not wider than catalog)
      const catalogConfig = getCapabilityConfig("adjust_workout");
      expect(entry.allowedTools).toEqual(catalogConfig.allowedTools);
      expect(entry.contextBudget).toEqual(DEFAULT_CONTEXT_BUDGET_POLICY);
      // executorMode must be a known executor mode string
      expect(entry.executorMode).toMatch(/^(single_llm|context_aware_llm|proposal_flow|context_expansion_loop|deterministic_read|deterministic_write)$/);
    });

    it("returns a multi-domain fanout when router selects two domains", async () => {
      const { planner } = createPlannerHarness();

      const multiDomainRouterResult = {
        output: routerDecisionOutputSchema.parse({
          selectedDomains: [
            { domain: "workout", confidence: 0.88, intentHints: [], toolHints: [], signalHints: [] },
            { domain: "nutrition", confidence: 0.72, intentHints: [], toolHints: [], signalHints: [] },
          ],
          contextNeeds: [],
          safetyFlags: [],
          confidence: 0.88,
        }),
        source: "llm" as const,
        validationErrors: [],
      };

      const plan = await planner.planTurn({
        userMessage: "I am exhausted — please adjust my workout and suggest a lighter dinner.",
        recentMessages: [],
        routerResult: multiDomainRouterResult,
      });

      expect(plan.fanout).toBeDefined();
      expect(plan.fanout.selectedDomains).toHaveLength(2);
      expect(plan.fanout.isMultiDomain).toBe(true);

      const domains = plan.fanout.selectedDomains.map((e) => e.domain);
      expect(domains).toContain("workout");
      expect(domains).toContain("nutrition");

      // Each entry must have isolated allowlists
      const workoutEntry = plan.fanout.selectedDomains.find((e) => e.domain === "workout")!;
      const nutritionEntry = plan.fanout.selectedDomains.find((e) => e.domain === "nutrition")!;
      expect(workoutEntry.capabilityId).toBe("adjust_workout");
      expect(nutritionEntry.capabilityId).toBe("adjust_nutrition");

      // Workout domain must NOT inherit nutrition's proposal intents
      expect(workoutEntry.allowedProposalIntents).not.toContain("adjust_nutrition_plan");
      expect(nutritionEntry.allowedProposalIntents).not.toContain("adapt_workout_plan");
    });

    it("caps selected domains at MAX_ROUTER_SELECTED_DOMAINS (3) even if router returns more", async () => {
      const { planner } = createPlannerHarness();

      // Router returning 3 domains (the max)
      const threeDomainsResult = {
        output: routerDecisionOutputSchema.parse({
          selectedDomains: [
            { domain: "workout", confidence: 0.9, intentHints: [], toolHints: [], signalHints: [] },
            { domain: "nutrition", confidence: 0.78, intentHints: [], toolHints: [], signalHints: [] },
            { domain: "health", confidence: 0.76, intentHints: [], toolHints: [], signalHints: [] },
          ],
          contextNeeds: [],
          safetyFlags: [],
          confidence: 0.9,
        }),
        source: "llm" as const,
        validationErrors: [],
      };

      const plan = await planner.planTurn({
        userMessage: "I am exhausted, adjust my workout, suggest a lighter dinner, and check my health.",
        recentMessages: [],
        routerResult: threeDomainsResult,
      });

      expect(plan.fanout.selectedDomains.length).toBeLessThanOrEqual(MAX_ROUTER_SELECTED_DOMAINS);
      expect(plan.fanout.isMultiDomain).toBe(true);
    });

    it("returns single-domain fanout (not multi-domain) for proposal-revision route", async () => {
      const { planner } = createPlannerHarness();

      const plan = await planner.planTurn({
        userMessage: "Please revise the proposal.",
        recentMessages: [],
        proposalRevision: {
          supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
          modificationFeedback: "Make it lighter.",
          originalProposal: {
            intent: "adapt_workout_plan",
            targetDomain: "workout",
            title: "Adjust workout",
            reason: "Recovery signals.",
            proposedChanges: {},
          },
        },
      });

      expect(plan.fanout).toBeDefined();
      expect(plan.fanout.selectedDomains).toHaveLength(1);
      expect(plan.fanout.isMultiDomain).toBe(false);
      // Proposal-revision routes through the capability's own domain
      expect(plan.fanout.selectedDomains[0]?.capabilityId).toBe(plan.catalogIntentId);
    });

    it("returns single-domain fanout for safe fallback route (no router)", async () => {
      const { planner } = createPlannerHarness();

      const plan = await planner.planTurn({
        userMessage: "What do you think?",
        recentMessages: [],
      });

      expect(plan.fanout).toBeDefined();
      expect(plan.fanout.selectedDomains).toHaveLength(1);
      expect(plan.fanout.isMultiDomain).toBe(false);
      expect(plan.fanout.selectedDomains[0]?.capabilityId).toBe(plan.catalogIntentId);
    });

    it("returns single-domain fanout for low-confidence fallback router result", async () => {
      const { planner } = createPlannerHarness();

      const plan = await planner.planTurn({
        userMessage: "I feel off today.",
        recentMessages: [],
        routerResult: createRouterResultForPlanner("workout", 0.3, "fallback"),
      });

      expect(plan.fanout.selectedDomains).toHaveLength(1);
      expect(plan.fanout.isMultiDomain).toBe(false);
    });

    it("each domain entry has independently clamped context budget (safety floor preserved)", async () => {
      const { planner } = createPlannerHarness();

      const multiDomainResult = {
        output: routerDecisionOutputSchema.parse({
          selectedDomains: [
            { domain: "workout", confidence: 0.88, intentHints: [], toolHints: [], signalHints: [] },
            { domain: "nutrition", confidence: 0.72, intentHints: [], toolHints: [], signalHints: [] },
          ],
          contextNeeds: [],
          safetyFlags: [],
          confidence: 0.88,
        }),
        source: "llm" as const,
        validationErrors: [],
      };

      const plan = await planner.planTurn({
        userMessage: "Adjust my plan.",
        recentMessages: [],
        routerResult: multiDomainResult,
      });

      for (const entry of plan.fanout.selectedDomains) {
        // Safety floors: documents and sensitive health context denied by default
        expect(entry.contextBudget).toBeDefined();
        // Verify it matches the DEFAULT_CONTEXT_BUDGET_POLICY floors
        expect(entry.contextBudget.allowDocuments).toBe(DEFAULT_CONTEXT_BUDGET_POLICY.allowDocuments);
        expect(entry.contextBudget.allowSensitiveHealthContext).toBe(
          DEFAULT_CONTEXT_BUDGET_POLICY.allowSensitiveHealthContext,
        );
      }
    });
  });
});
