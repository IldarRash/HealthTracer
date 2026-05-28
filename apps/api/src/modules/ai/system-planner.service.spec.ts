import { describe, expect, it, vi } from "vitest";
import { getCapabilityConfig, normalizeAiBehaviorConfig } from "@health/types";
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

function createPlannerHarness() {
  const stack = createAiPolicyTestStack();
  const generateIntentRoute = vi.fn();

  return {
    planner: stack.systemPlannerService,
    capabilityRegistryService: stack.capabilityRegistryService,
    responseModePolicyService: stack.responseModePolicyService,
    provider: { generateIntentRoute },
  };
}

describe("SystemPlannerService", () => {
  it("plans llm text turns with registry-backed metadata and response mode", async () => {
    const { planner, provider, capabilityRegistryService } = createPlannerHarness();
    const capabilityConfig = getCapabilityConfig("adjust_workout");

    provider.generateIntentRoute.mockResolvedValue({
      catalogIntentId: "adjust_workout",
      confidence: 0.84,
      routingMethod: "llm_router",
      requiredContextSlices: [capabilityConfig.defaultContextStrategy],
      safetyFlags: ["fatigue"],
      expectedResponseMode: "recommendation_with_optional_proposal",
    });

    const plan = await planner.planTurn(
      {
        userMessage: "Can you adapt my workout plan this week?",
        recentMessages: [],
      },
      provider as never,
    );

    expect(provider.generateIntentRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        intentCatalog: capabilityRegistryService.serializeForRouter(),
      }),
    );
    expect(plan.catalogIntentId).toBe("adjust_workout");
    expect(plan.route.routingMethod).toBe("llm_router");
    expect(plan.expectedResponseMode).toBe("recommendation_with_optional_proposal");
    expect(plan.defaultContextStrategy).toEqual(capabilityConfig.defaultContextStrategy);
    expect(plan.intentDefinition.id).toBe("adjust_workout");
    expect(plan.intentDefinition.promptInstructions).toBe(capabilityConfig.prompt);
    expect(plan.primaryCapabilityId).toBe("adjust_workout");
    expect(plan.selectedCapabilities).toEqual(["adjust_workout"]);
    expect(plan.presentationMetadata.primaryCapabilityId).toBe("adjust_workout");
    expect(plan.presentationMetadata.widgetDescriptors.length).toBeGreaterThan(0);
    expect(plan.presentationMetadata.actionDescriptors.length).toBeGreaterThan(0);
  });

  it("routes attachment turns through registry context strategy without llm router", async () => {
    const { planner, provider } = createPlannerHarness();
    const capabilityConfig = getCapabilityConfig("attachment_food_photo");

    const plan = await planner.planTurn(
      {
        userMessage: "Shared attachment(s) for coaching review.",
        recentMessages: [],
        attachmentTurn: {
          attachments: [
            {
              attachmentRefId: "a1000001-0000-4000-8000-000000000001",
              category: "food_photo",
              status: "ready",
            },
          ],
        },
      },
      provider as never,
    );

    expect(provider.generateIntentRoute).not.toHaveBeenCalled();
    expect(plan.catalogIntentId).toBe("attachment_food_photo");
    expect(plan.route.routingMethod).toBe("attachment_family");
    expect(plan.route.requiredContextSlices).toEqual([capabilityConfig.defaultContextStrategy]);
    expect(plan.expectedResponseMode).toBe(
      capabilityConfig.responseMetadata?.expectedResponseMode,
    );
  });

  it("falls back to uncertain general route when llm router output is invalid", async () => {
    const { planner, provider } = createPlannerHarness();
    const generalConfig = getCapabilityConfig("general");

    provider.generateIntentRoute.mockResolvedValue({
      catalogIntentId: "adjust_workout",
      confidence: 0.86,
      routingMethod: "llm_router",
      requiredContextSlices: [{ type: "workout_adaptation", depth: "medium", timeRange: "14d" }],
      safetyFlags: ["fatigue"],
      expectedResponseMode: "recommendation_with_optional_proposal",
      reply: "Skip training today.",
    });

    const plan = await planner.planTurn(
      {
        userMessage: "I feel completely off today. What should I do?",
        recentMessages: [],
      },
      provider as never,
    );

    expect(plan.catalogIntentId).toBe("general");
    expect(plan.route.isConfident).toBe(false);
    expect(plan.route.confidence).toBe(0.35);
    expect(plan.route.requiredContextSlices).toEqual([generalConfig.defaultContextStrategy]);
    expect(plan.expectedResponseMode).toBe(generalConfig.responseMetadata?.expectedResponseMode);
  });

  it("uses registry fallback context strategy for unknown capability ids", () => {
    const { planner } = createPlannerHarness();
    const generalConfig = getCapabilityConfig("general");

    expect(
      planner.resolveContextStrategyFallback("not_a_capability" as "general", "general"),
    ).toEqual(generalConfig.defaultContextStrategy);
  });

  it("classifies explicit direct path candidates without calling the llm router", async () => {
    const { planner, provider } = createPlannerHarness();

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

    expect(
      planner.classifyDirectPathCandidate({
        userMessage: "Make workout easier",
      }),
    ).toBeNull();

    await planner.planTurn(
      {
        userMessage: "What is today?",
        recentMessages: [],
      },
      provider as never,
    );

    expect(provider.generateIntentRoute).toHaveBeenCalled();
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

  it("routes explicit proposal explainer turns without llm router", async () => {
    const { planner, provider } = createPlannerHarness();
    const capabilityConfig = getCapabilityConfig("proposal_explainer");

    const plan = await planner.planTurn(
      {
        userMessage: "Why this proposal?",
        recentMessages: [],
      },
      provider as never,
    );

    expect(provider.generateIntentRoute).not.toHaveBeenCalled();
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
    const { planner, provider, capabilityRegistryService } = createPlannerHarness();
    const capabilityConfig = getCapabilityConfig("adjust_workout");

    provider.generateIntentRoute.mockResolvedValue({
      catalogIntentId: "adjust_workout",
      confidence: 0.84,
      routingMethod: "llm_router",
      requiredContextSlices: [capabilityConfig.defaultContextStrategy],
      safetyFlags: [],
      expectedResponseMode: "recommendation_with_optional_proposal",
    });

    const plan = await planner.planTurn(
      {
        userMessage: "Why should I train today?",
        recentMessages: [],
      },
      provider as never,
    );

    expect(provider.generateIntentRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        intentCatalog: capabilityRegistryService.serializeForRouter(),
      }),
    );
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

    const plan = await planner.planTurn(
      {
        userMessage: "Can you adapt my workout plan this week?",
        recentMessages: [],
        attachmentTurn: {
          attachments: [
            {
              attachmentRefId: "a1000001-0000-4000-8000-000000000001",
              category: "food_photo",
              status: "ready",
            },
          ],
        },
      },
      { generateIntentRoute: vi.fn() } as never,
    );

    expect(resolveSelectedCapabilityIds).toHaveBeenCalledWith("attachment_food_photo");
    expect(resolvePresentationMetadata).toHaveBeenCalledWith("attachment_food_photo", [
      "adjust_workout",
      "ask_about_today",
    ]);
    expect(plan.primaryCapabilityId).toBe("attachment_food_photo");
    expect(plan.selectedCapabilities).toEqual(["adjust_workout", "ask_about_today"]);
    expect(plan.intentDefinition.id).toBe("attachment_food_photo");
  });

  it("attaches default context budget for routine llm turns", async () => {
    const { planner, provider } = createPlannerHarness();
    const capabilityConfig = getCapabilityConfig("adjust_workout");

    provider.generateIntentRoute.mockResolvedValue({
      catalogIntentId: "adjust_workout",
      confidence: 0.84,
      routingMethod: "llm_router",
      requiredContextSlices: [capabilityConfig.defaultContextStrategy],
      safetyFlags: [],
      expectedResponseMode: "recommendation_with_optional_proposal",
    });

    const plan = await planner.planTurn(
      {
        userMessage: "Can you adapt my workout plan this week?",
        recentMessages: [],
      },
      provider as never,
    );

    expect(plan.contextBudget).toEqual(DEFAULT_CONTEXT_BUDGET_POLICY);
    expect(plan.isMonthlyReview).toBe(false);
    expect(plan.isMultiDomainReview).toBe(false);
    expect(plan.requiresCompression).toBe(false);
  });

  it("flags multi-domain review and deep review budget for cross-domain turns", async () => {
    const { planner, provider } = createPlannerHarness();

    provider.generateIntentRoute.mockResolvedValue({
      catalogIntentId: "general",
      confidence: 0.88,
      routingMethod: "llm_router",
      requiredContextSlices: [
        { type: "workout_adaptation", depth: "medium", timeRange: "14d" },
        { type: "nutrition_adaptation", depth: "medium", timeRange: "14d" },
      ],
      safetyFlags: [],
      expectedResponseMode: "advice_only",
    });

    const plan = await planner.planTurn(
      {
        userMessage: "How are my workout and nutrition trends together?",
        recentMessages: [],
      },
      provider as never,
    );

    expect(plan.contextBudget.profile).toBe("deep_review");
    expect(plan.isMultiDomainReview).toBe(true);
    expect(plan.requiresCompression).toBe(true);
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
    const provider = { generateIntentRoute: vi.fn() };

    const plan = await planner.planTurn(
      {
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
      },
      provider as never,
    );

    expect(provider.generateIntentRoute).not.toHaveBeenCalled();
    expect(plan.catalogIntentId).toBe("general");
    expect(plan.route.routingMethod).toBe("rule_based");
  });

  it("attaches deep review budget and flags for monthly progress review turns", async () => {
    const { planner, provider } = createPlannerHarness();

    provider.generateIntentRoute.mockResolvedValue({
      catalogIntentId: "review_progress",
      confidence: 0.9,
      routingMethod: "llm_router",
      requiredContextSlices: [
        { type: "weekly_review", depth: "large", timeRange: "30d" },
      ],
      safetyFlags: [],
      expectedResponseMode: "recommendation_with_optional_proposal",
    });

    const plan = await planner.planTurn(
      {
        userMessage: "How did my last month of training and recovery go?",
        recentMessages: [],
      },
      provider as never,
    );

    expect(plan.contextBudget).toEqual(DEEP_REVIEW_CONTEXT_BUDGET_POLICY);
    expect(plan.isMonthlyReview).toBe(true);
    expect(plan.isProgressReview).toBe(true);
    expect(plan.requiresCompression).toBe(true);
  });
});
