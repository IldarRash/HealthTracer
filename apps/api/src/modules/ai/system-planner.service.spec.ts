import { describe, expect, it, vi } from "vitest";
import {
  getCapabilityConfig,
  turnDecisionOutputSchema,
  turnDecisionRequestSchema,
  turnDecisionResultSchema,
  normalizeAiBehaviorConfig,
} from "@health/types";
import {
  DEFAULT_CONTEXT_BUDGET_POLICY,
  DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
} from "@health/types";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import { ContextBudgetPolicyService } from "../coaching-context/context-budget-policy.service.js";
import { DirectChatPathMatcherService } from "./direct-chat-path-matcher.service.js";
import { ProposalExplainerMatcherService } from "./proposal-explainer-matcher.service.js";
import { ResponseModePolicyService } from "./response-mode-policy.service.js";
import { SystemPlannerService } from "./system-planner.service.js";
import { createAiPolicyTestStack } from "./test-ai-behavior-fixtures.js";

function createTurnDecisionResultForPlanner(
  capabilityId: "attachment_food_photo" | "adjust_workout" | "general" = "attachment_food_photo",
  confidence = 0.84,
) {
  turnDecisionRequestSchema.parse({
    originalText: "Log this meal",
    normalizedText: "log this meal",
    preprocessor: {
      originalText: "Log this meal",
      normalizedText: "log this meal",
      detectedLanguage: "en",
      responseLanguage: "en",
      hasAttachments: true,
      mentionedDates: [],
      simpleSignals: {
        workout: false,
        nutrition: true,
        today: false,
        sleep: false,
        fatigue: false,
        pain: false,
        document: false,
        attachment: true,
      },
      directPathCandidate: null,
    },
    attachmentContextSummaries: [],
    recentMessageHints: [],
    catalogHints: [],
    availableTools: [],
  });

  return turnDecisionResultSchema.parse({
    output: turnDecisionOutputSchema.parse({
      signals:
        capabilityId === "adjust_workout"
          ? ["request_change"]
          : capabilityId === "general"
            ? ["question"]
            : ["attachment_reference"],
      entities: [],
      routeCapabilityHints: [{ capabilityId, confidence: 0.86 }],
      complexity: "moderate",
      directCommand: { detected: false },
      safetyFlags: capabilityId === "adjust_workout" ? ["fatigue"] : [],
      contextNeeds:
        capabilityId === "adjust_workout"
          ? ["active_workout_plan"]
          : capabilityId === "general"
            ? ["recent_conversation"]
            : ["attachment_context"],
      attachmentHints: [],
      toolNeeds: [],
      confidence,
    }),
    source: "llm",
    validationErrors: [],
  });
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
  it("routes confident turn decision without safe fallback", async () => {
    const { planner } = createPlannerHarness();
    const capabilityConfig = getCapabilityConfig("adjust_workout");

    const plan = await planner.planTurn({
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
      turnDecision: createTurnDecisionResultForPlanner("adjust_workout", 0.84),
    });

    expect(plan.catalogIntentId).toBe("adjust_workout");
    expect(plan.route.routingMethod).toBe("unified_turn_decision");
    expect(plan.route.isConfident).toBe(true);
    expect(plan.route.safetyFlags).toEqual(["fatigue"]);
    expect(plan.route.requiredContextSlices).toEqual(
      expect.arrayContaining([capabilityConfig.defaultContextStrategy]),
    );
  });

  it("falls back to general when turn decision confidence is low", async () => {
    const { planner } = createPlannerHarness();
    const generalConfig = getCapabilityConfig("general");

    const plan = await planner.planTurn({
      userMessage: "I feel completely off today. What should I do?",
      recentMessages: [],
      turnDecision: {
        ...createTurnDecisionResultForPlanner("general", 0.35),
        source: "fallback",
      },
    });

    expect(plan.route.routingMethod).toBe("unified_turn_decision");
    expect(plan.catalogIntentId).toBe("general");
    expect(plan.route.isConfident).toBe(false);
    expect(plan.route.confidence).toBe(0.35);
    expect(plan.route.requiredContextSlices).toEqual([generalConfig.defaultContextStrategy]);
  });

  it("routes confident unified turn decision for attachment turns", async () => {
    const { planner } = createPlannerHarness();
    const capabilityConfig = getCapabilityConfig("attachment_food_photo");

    const plan = await planner.planTurn({
      userMessage: "Log this meal",
      recentMessages: [],
      turnDecision: createTurnDecisionResultForPlanner("attachment_food_photo", 0.84),
      attachmentTurn: {
        attachments: [
          {
            attachmentRefId: "a1000001-0000-4000-8000-000000000002",
            category: "food_photo",
            status: "recognized",
          },
        ],
      },
    });

    expect(plan.catalogIntentId).toBe("attachment_food_photo");
    expect(plan.route.routingMethod).toBe("unified_turn_decision");
    expect(plan.route.requiredContextSlices).toEqual(
      expect.arrayContaining([capabilityConfig.defaultContextStrategy]),
    );
  });

  it("does not bypass attachments when turn decision is low confidence", async () => {
    const { planner } = createPlannerHarness();
    const generalConfig = getCapabilityConfig("general");

    const plan = await planner.planTurn({
      userMessage: "Log this meal",
      recentMessages: [],
      turnDecision: {
        ...createTurnDecisionResultForPlanner("attachment_food_photo", 0.2),
        source: "fallback",
      },
      attachmentTurn: {
        attachments: [
          {
            attachmentRefId: "a1000001-0000-4000-8000-000000000002",
            category: "food_photo",
            status: "recognized",
          },
        ],
      },
    });

    expect(plan.catalogIntentId).toBe("general");
    expect(plan.route.routingMethod).toBe("unified_turn_decision");
    expect(plan.route.requiredContextSlices).toEqual([generalConfig.defaultContextStrategy]);
  });

  it("uses rule_based safe fallback when turn decision did not run", async () => {
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
              status: "ready",
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
      turnDecision: createTurnDecisionResultForPlanner("adjust_workout", 0.84),
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
      turnDecision: createTurnDecisionResultForPlanner("attachment_food_photo", 0.84),
      attachmentTurn: {
        attachments: [
          {
            attachmentRefId: "a1000001-0000-4000-8000-000000000001",
            category: "food_photo",
            status: "ready",
          },
        ],
      },
    });

    expect(resolveSelectedCapabilityIds).toHaveBeenCalledWith("attachment_food_photo");
    expect(resolvePresentationMetadata).toHaveBeenCalledWith("attachment_food_photo", [
      "adjust_workout",
      "ask_about_today",
    ]);
    expect(plan.primaryCapabilityId).toBe("attachment_food_photo");
    expect(plan.selectedCapabilities).toEqual(["adjust_workout", "ask_about_today"]);
    expect(plan.intentDefinition.id).toBe("attachment_food_photo");
  });

  it("attaches default context budget for confident turn decision turns", async () => {
    const { planner } = createPlannerHarness();

    const plan = await planner.planTurn({
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
      turnDecision: createTurnDecisionResultForPlanner("adjust_workout", 0.84),
    });

    expect(plan.contextBudget).toEqual(DEFAULT_CONTEXT_BUDGET_POLICY);
    expect(plan.isMonthlyReview).toBe(false);
    expect(plan.isMultiDomainReview).toBe(false);
    expect(plan.requiresCompression).toBe(false);
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
            days: [{ day: "Day 1", focus: "Recovery", exercises: ["Walk"] }],
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
        turnDecision: createTurnDecisionResultForPlanner("adjust_workout", 0.84),
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

    it("maps confident turn decision to context_aware_llm for advice-only capabilities", async () => {
      const { planner } = createPlannerHarness();

      const plan = await planner.planTurn({
        userMessage: "How can I stay consistent this week?",
        recentMessages: [],
        turnDecision: createTurnDecisionResultForPlanner("general", 0.84),
      });

      expect(plan.catalogIntentId).toBe("general");
      expect(plan.route.routingMethod).toBe("unified_turn_decision");
      expect(plan.executorMode).toBe("context_aware_llm");
    });

    it("maps low-confidence turn decision fallback to context_aware_llm for general", async () => {
      const { planner } = createPlannerHarness();

      const plan = await planner.planTurn({
        userMessage: "I feel completely off today. What should I do?",
        recentMessages: [],
        turnDecision: {
          ...createTurnDecisionResultForPlanner("general", 0.35),
          source: "fallback",
        },
      });

      expect(plan.route.routingMethod).toBe("unified_turn_decision");
      expect(plan.catalogIntentId).toBe("general");
      expect(plan.executorMode).toBe("context_aware_llm");
    });

    it("ignores turn decision when proposal revision context is present", async () => {
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
              days: [{ day: "Day 1", focus: "Recovery", exercises: ["Walk"] }],
              notes: [],
            },
          },
        },
        turnDecision: createTurnDecisionResultForPlanner("general", 0.84),
      });

      expect(plan.route.routingMethod).toBe("rule_based");
      expect(plan.catalogIntentId).toBe("adjust_workout");
    });
  });
});
