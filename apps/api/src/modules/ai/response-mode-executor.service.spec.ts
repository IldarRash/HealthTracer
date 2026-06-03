import { describe, expect, it, vi } from "vitest";
import type { AgentContextPacket } from "@health/types";
import {
  buildRouteFromCatalogIntent,
  getCapabilityConfig,
  routerDecisionOutputSchema,
} from "@health/types";
import { ActionResolverService } from "./action-resolver.service.js";
import { ResponseModeExecutorService } from "./response-mode-executor.service.js";
import type { CapabilityPlanResult } from "./system-planner.service.js";
import { createAiPolicyTestStack } from "./test-ai-behavior-fixtures.js";
import { buildAgentPromptContextFromPacket } from "../coaching-context/agent-prompt-context.js";
import type { ResponseModeExecutorTurnInput } from "./response-mode-executor.service.js";

function createRouterTurn(
  overrides: Partial<ResponseModeExecutorTurnInput["routerTurn"]> = {},
): ResponseModeExecutorTurnInput["routerTurn"] {
  return {
    routerRan: false,
    ...overrides,
  };
}

function createPlan(overrides: Partial<CapabilityPlanResult> = {}): CapabilityPlanResult {
  const stack = createAiPolicyTestStack();
  const capabilityConfig = getCapabilityConfig("adjust_workout");
  const route = buildRouteFromCatalogIntent({
    catalogIntentId: "adjust_workout",
    mappedAgentIntent: "adjust_workout",
    confidence: 0.84,
    routingMethod: "unified_turn_decision",
    requiredContextSlices: [capabilityConfig.defaultContextStrategy],
    expectedResponseMode: "recommendation_with_optional_proposal",
  });
  const intentDefinition = stack.capabilityRegistryService.getCoachIntentDefinition("adjust_workout");
  const presentationMetadata = stack.capabilityRegistryService.resolvePresentationMetadata(
    "adjust_workout",
    ["adjust_workout"],
  );

  return {
    route,
    intentDefinition,
    catalogIntentId: "adjust_workout",
    primaryCapabilityId: "adjust_workout",
    selectedCapabilities: ["adjust_workout"],
    presentationMetadata,
    expectedResponseMode: "recommendation_with_optional_proposal",
    executorMode: "proposal_flow",
    defaultContextStrategy: capabilityConfig.defaultContextStrategy,
    contextBudget: stack.contextBudgetPolicyService.buildPlanMetadata({
      userMessage: "Adapt my workout",
      route,
      selectedCapabilities: ["adjust_workout"],
    }).contextBudget,
    isMonthlyReview: false,
    isMultiDomainReview: false,
    isProgressReview: false,
    hasExtendedLookback: false,
    requiresCompression: false,
    ...overrides,
  };
}

function createContextPacket(): AgentContextPacket {
  return {
    purpose: "workout_adaptation",
    depth: "medium",
    timeRange: "14d",
    intent: "adjust_workout",
    generatedAt: new Date().toISOString(),
    safetyConstraints: ["Do not diagnose medical conditions."],
    supplementarySlices: [],
    missingContextNotes: [],
    sourceRefs: [],
    slice: {
      purpose: "workout_adaptation",
      depth: "medium",
      timeRange: "14d",
      generatedAt: new Date().toISOString(),
      relevantMemories: [],
      snapshots: [],
      recommendationConstraints: [],
      sourceRefs: [],
    },
  };
}

describe("ResponseModeExecutorService", () => {
  it("delegates deterministic read modes without invoking the coach llm", async () => {
    const generateAgentLoopStep = vi.fn();
    const executor = new ResponseModeExecutorService(
      new ActionResolverService(),
      { executeTool: vi.fn() } as never,
    );
    const contextPacket = createContextPacket();
    const plan = createPlan({
      executorMode: "deterministic_read",
      route: buildRouteFromCatalogIntent({
        catalogIntentId: "general",
        mappedAgentIntent: "general",
        confidence: 0.95,
        routingMethod: "rule_based",
        expectedResponseMode: "advice_only",
      }),
    });

    const result = await executor.execute({
      plan,
      orchestratorInput: {
        auth: {
          clerkUserId: "clerk-user",
          email: "test@example.com",
          displayName: "Test",
        },
        userMessage: "What is today?",
        recentMessages: [],
      },
      contextPacket,
      coachingContext: buildAgentPromptContextFromPacket(contextPacket),
      capabilityTurnMetadata: {
        primaryCapabilityId: "general",
        selectedCapabilityIds: ["general"],
        compositionStrategy: "primary_only",
        widgetDescriptors: [],
        actionDescriptors: [],
      },
      routerTurn: createRouterTurn(),
      directPathCandidate: {
        kind: "today_summary_read",
        confidence: 0.95,
        routingMethod: "rule_based",
      },
      provider: { generateAgentLoopStep } as never,
    });

    expect(generateAgentLoopStep).not.toHaveBeenCalled();
    expect(result.output.reply).toContain("before the AI coach ran");
    expect(result.responseModeExecution).toMatchObject({
      executorMode: "deterministic_read",
      llmInvoked: false,
      delegatedToPreAiGate: true,
      preAiGateDelegationMissed: true,
      handlerPath: "pre_ai_gate_delegation",
      maxLoopIterations: 0,
      allowToolLoop: false,
    });
  });

  it("runs the coach loop for proposal_flow and records llm invocation", async () => {
    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "final_answer",
      reply: "I can suggest a workout adjustment for review.",
      proposals: [
        {
          intent: "adapt_workout_plan",
          targetDomain: "workout",
          title: "Adjust plan",
        },
      ],
    });
    const executor = new ResponseModeExecutorService(
      new ActionResolverService(),
      { executeTool: vi.fn() } as never,
    );
    const contextPacket = createContextPacket();
    const plan = createPlan({ executorMode: "proposal_flow" });

    const result = await executor.execute({
      plan,
      orchestratorInput: {
        auth: {
          clerkUserId: "clerk-user",
          email: "test@example.com",
          displayName: "Test",
        },
        userMessage: "Can you adapt my workout plan this week?",
        recentMessages: [],
      },
      contextPacket,
      coachingContext: buildAgentPromptContextFromPacket(contextPacket),
      capabilityTurnMetadata: {
        primaryCapabilityId: "adjust_workout",
        selectedCapabilityIds: ["adjust_workout"],
        compositionStrategy: "primary_only",
        widgetDescriptors: [],
        actionDescriptors: [],
      },
      routerTurn: createRouterTurn({ routerRan: true }),
      provider: { generateAgentLoopStep } as never,
    });

    expect(generateAgentLoopStep).toHaveBeenCalled();
    expect(result.responseModeExecution).toMatchObject({
      executorMode: "proposal_flow",
      llmInvoked: true,
      handlerPath: "proposal_bounded_loop",
      maxLoopIterations: 3,
      allowToolLoop: true,
    });
    const loopRequest = generateAgentLoopStep.mock.calls[0]?.[0] as {
      agentMetadata?: { responseModeExecutor?: { handlerPath?: string } };
      maxIterations?: number;
    };
    expect(loopRequest.maxIterations).toBe(3);
    expect(loopRequest.agentMetadata?.responseModeExecutor?.handlerPath).toBe(
      "proposal_bounded_loop",
    );
  });

  it("delegates deterministic write modes without invoking the coach llm", async () => {
    const generateAgentLoopStep = vi.fn();
    const executor = new ResponseModeExecutorService(
      new ActionResolverService(),
      { executeTool: vi.fn() } as never,
    );
    const plan = createPlan({
      executorMode: "deterministic_write",
      route: buildRouteFromCatalogIntent({
        catalogIntentId: "general",
        mappedAgentIntent: "general",
        confidence: 0.95,
        routingMethod: "rule_based",
        expectedResponseMode: "advice_only",
      }),
    });

    const result = await executor.execute({
      plan,
      orchestratorInput: {
        auth: {
          clerkUserId: "clerk-user",
          email: "test@example.com",
          displayName: "Test",
        },
        userMessage: "Mark today's workout done",
        recentMessages: [],
      },
      contextPacket: createContextPacket(),
      coachingContext: buildAgentPromptContextFromPacket(createContextPacket()),
      capabilityTurnMetadata: {
        primaryCapabilityId: "general",
        selectedCapabilityIds: ["general"],
        compositionStrategy: "primary_only",
        widgetDescriptors: [],
        actionDescriptors: [],
      },
      routerTurn: createRouterTurn(),
      directPathCandidate: {
        kind: "mark_today_workout_done",
        confidence: 0.95,
        routingMethod: "rule_based",
      },
      provider: { generateAgentLoopStep } as never,
    });

    expect(generateAgentLoopStep).not.toHaveBeenCalled();
    expect(result.responseModeExecution).toMatchObject({
      executorMode: "deterministic_write",
      llmInvoked: false,
      delegatedToPreAiGate: true,
      preAiGateDelegationMissed: true,
      handlerPath: "pre_ai_gate_delegation",
    });
  });

  it("runs single_llm advice-only turns and records llm invocation", async () => {
    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "final_answer",
      reply: "This proposal explains the earlier recommendation.",
      proposals: [],
    });
    const executor = new ResponseModeExecutorService(
      new ActionResolverService(),
      { executeTool: vi.fn() } as never,
    );
    const stack = createAiPolicyTestStack();
    const capabilityConfig = getCapabilityConfig("proposal_explainer");
    const route = buildRouteFromCatalogIntent({
      catalogIntentId: "proposal_explainer",
      mappedAgentIntent: "proposal_explainer",
      confidence: 0.95,
      routingMethod: "rule_based",
      requiredContextSlices: [capabilityConfig.defaultContextStrategy],
      expectedResponseMode: "advice_only",
    });
    const plan = createPlan({
      route,
      intentDefinition: stack.capabilityRegistryService.getCoachIntentDefinition("proposal_explainer"),
      catalogIntentId: "proposal_explainer",
      primaryCapabilityId: "proposal_explainer",
      selectedCapabilities: ["proposal_explainer"],
      presentationMetadata: stack.capabilityRegistryService.resolvePresentationMetadata(
        "proposal_explainer",
        ["proposal_explainer"],
      ),
      expectedResponseMode: "advice_only",
      executorMode: "single_llm",
      defaultContextStrategy: capabilityConfig.defaultContextStrategy,
    });
    const contextPacket: AgentContextPacket = {
      purpose: "general_chat",
      depth: "small",
      timeRange: "7d",
      intent: "proposal_explainer",
      generatedAt: new Date().toISOString(),
      safetyConstraints: ["Do not diagnose medical conditions."],
      supplementarySlices: [],
      missingContextNotes: [],
      sourceRefs: [],
      slice: {
        purpose: "general_chat",
        depth: "small",
        timeRange: "7d",
        generatedAt: new Date().toISOString(),
        relevantMemories: [],
        snapshots: [],
        recommendationConstraints: [],
        sourceRefs: [],
      },
    };

    const result = await executor.execute({
      plan,
      orchestratorInput: {
        auth: {
          clerkUserId: "clerk-user",
          email: "test@example.com",
          displayName: "Test",
        },
        userMessage: "Why this proposal?",
        recentMessages: [],
      },
      contextPacket,
      coachingContext: buildAgentPromptContextFromPacket(contextPacket),
      capabilityTurnMetadata: {
        primaryCapabilityId: "proposal_explainer",
        selectedCapabilityIds: ["proposal_explainer"],
        compositionStrategy: "primary_only",
        widgetDescriptors: [],
        actionDescriptors: [],
      },
      routerTurn: createRouterTurn(),
      provider: { generateAgentLoopStep } as never,
    });

    expect(generateAgentLoopStep).toHaveBeenCalledTimes(1);
    expect(result.responseModeExecution).toMatchObject({
      executorMode: "single_llm",
      llmInvoked: true,
      handlerPath: "single_final_answer",
      maxLoopIterations: 1,
      allowToolLoop: false,
    });
    expect(result.output.proposals).toEqual([]);
    const loopRequest = generateAgentLoopStep.mock.calls[0]?.[0] as { maxIterations?: number };
    expect(loopRequest.maxIterations).toBe(1);
  });

  it("rejects tool requests in single_llm mode", async () => {
    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "tool_request",
      tool: "getUserContextSlice",
      input: { purpose: "daily_checkin" },
    });
    const executor = new ResponseModeExecutorService(
      new ActionResolverService(),
      { executeTool: vi.fn() } as never,
    );
    const stack = createAiPolicyTestStack();
    const capabilityConfig = getCapabilityConfig("proposal_explainer");
    const route = buildRouteFromCatalogIntent({
      catalogIntentId: "proposal_explainer",
      mappedAgentIntent: "proposal_explainer",
      confidence: 0.95,
      routingMethod: "rule_based",
      requiredContextSlices: [capabilityConfig.defaultContextStrategy],
      expectedResponseMode: "advice_only",
    });
    const plan = createPlan({
      route,
      intentDefinition: stack.capabilityRegistryService.getCoachIntentDefinition("proposal_explainer"),
      catalogIntentId: "proposal_explainer",
      primaryCapabilityId: "proposal_explainer",
      selectedCapabilities: ["proposal_explainer"],
      presentationMetadata: stack.capabilityRegistryService.resolvePresentationMetadata(
        "proposal_explainer",
        ["proposal_explainer"],
      ),
      expectedResponseMode: "advice_only",
      executorMode: "single_llm",
    });

    const result = await executor.execute({
      plan,
      orchestratorInput: {
        auth: {
          clerkUserId: "clerk-user",
          email: "test@example.com",
          displayName: "Test",
        },
        userMessage: "Why this proposal?",
        recentMessages: [],
      },
      contextPacket: createContextPacket(),
      coachingContext: buildAgentPromptContextFromPacket(createContextPacket()),
      capabilityTurnMetadata: {
        primaryCapabilityId: "proposal_explainer",
        selectedCapabilityIds: ["proposal_explainer"],
        compositionStrategy: "primary_only",
        widgetDescriptors: [],
        actionDescriptors: [],
      },
      routerTurn: createRouterTurn(),
      provider: { generateAgentLoopStep } as never,
    });

    expect(generateAgentLoopStep).toHaveBeenCalledTimes(1);
    expect(result.parseErrors[0]).toContain("does not allow tool loops");
    expect(result.responseModeExecution?.handlerPath).toBe("single_final_answer");
  });

  it("blocks a disallowed tool request in loop-allowing mode with safe fallback", async () => {
    // The agent requests a tool that is NOT in the intent's allowedTools list.
    // adjust_workout allows ["getUserContextSlice", "getWeeklyProgressContext"],
    // so "getDocumentContext" is disallowed.
    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "tool_request",
      tool: "getDocumentContext",
      input: {},
    });
    const executor = new ResponseModeExecutorService(
      new ActionResolverService(),
      { executeTool: vi.fn() } as never,
    );
    const contextPacket = createContextPacket();
    const plan = createPlan({ executorMode: "proposal_flow" });

    const result = await executor.execute({
      plan,
      orchestratorInput: {
        auth: {
          clerkUserId: "clerk-user",
          email: "test@example.com",
          displayName: "Test",
        },
        userMessage: "Adapt my workout plan",
        recentMessages: [],
      },
      contextPacket,
      coachingContext: buildAgentPromptContextFromPacket(contextPacket),
      capabilityTurnMetadata: {
        primaryCapabilityId: "adjust_workout",
        selectedCapabilityIds: ["adjust_workout"],
        compositionStrategy: "primary_only",
        widgetDescriptors: [],
        actionDescriptors: [],
      },
      routerTurn: createRouterTurn({ routerRan: true }),
      provider: { generateAgentLoopStep } as never,
    });

    // Safe fallback reply and empty proposals
    expect(result.output.reply).toBe(
      "I could not safely process that response. Please try again with a wellness-focused question.",
    );
    expect(result.output.proposals).toEqual([]);
    // Safety status is parse_failed
    expect(result.agentMetadata.safety.status).toBe("parse_failed");
    // Error message names the disallowed tool and the intent
    expect(result.parseErrors[0]).toContain("is not allowed for intent");
    expect(result.parseErrors[0]).toContain("getDocumentContext");
  });

  it("records an allowed tool in toolsInvoked and returns the final answer", async () => {
    // The agent requests "getUserContextSlice" (allowed for adjust_workout), then returns a final answer.
    const generateAgentLoopStep = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "tool_request",
        tool: "getUserContextSlice",
        input: { purpose: "workout_adaptation" },
      })
      .mockResolvedValueOnce({
        kind: "final_answer",
        reply: "Here is your adapted workout suggestion.",
        proposals: [],
      });

    const executeTool = vi.fn().mockResolvedValue({
      tool: "getUserContextSlice",
      ok: true,
      result: { snapshots: [] },
      errors: [],
    });

    const executor = new ResponseModeExecutorService(
      new ActionResolverService(),
      { executeTool } as never,
    );
    const contextPacket = createContextPacket();
    const plan = createPlan({ executorMode: "proposal_flow" });

    const result = await executor.execute({
      plan,
      orchestratorInput: {
        auth: {
          clerkUserId: "clerk-user",
          email: "test@example.com",
          displayName: "Test",
        },
        userMessage: "Adapt my workout plan",
        recentMessages: [],
      },
      contextPacket,
      coachingContext: buildAgentPromptContextFromPacket(contextPacket),
      capabilityTurnMetadata: {
        primaryCapabilityId: "adjust_workout",
        selectedCapabilityIds: ["adjust_workout"],
        compositionStrategy: "primary_only",
        widgetDescriptors: [],
        actionDescriptors: [],
      },
      routerTurn: createRouterTurn({ routerRan: true }),
      provider: { generateAgentLoopStep } as never,
    });

    // The loop continued past the tool step and produced a final answer
    expect(generateAgentLoopStep).toHaveBeenCalledTimes(2);
    // The invoked tool is recorded in agentMetadata
    expect(result.agentMetadata.toolsInvoked).toContain("getUserContextSlice");
    // No parse errors — the loop succeeded
    expect(result.parseErrors).toEqual([]);
    expect(result.output.reply).toBe("Here is your adapted workout suggestion.");
  });

  it.each([
    ["parse_failed", { kind: "unexpected_step" }],
    [
      "provider_error",
      new Error("OpenAI unavailable"),
    ],
    [
      "reply_blocked",
      {
        kind: "final_answer",
        reply: "I can prescribe a treatment for your symptoms.",
        proposals: [],
      },
    ],
  ] as const)(
    "marks unified blocked fallback for %s without coach proposals",
    async (expectedSafetyStatus, providerPayload) => {
      const generateAgentLoopStep =
        providerPayload instanceof Error
          ? vi.fn().mockRejectedValue(providerPayload)
          : vi.fn().mockResolvedValue(providerPayload);
      const executor = new ResponseModeExecutorService(
        new ActionResolverService(),
        { executeTool: vi.fn() } as never,
      );
      const contextPacket = createContextPacket();
      const plan = createPlan();

      const result = await executor.execute({
        plan,
        orchestratorInput: {
          auth: {
            clerkUserId: "clerk-user",
            email: "test@example.com",
            displayName: "Test",
          },
          userMessage: "Log this meal from the photo",
          recentMessages: [],
        },
        contextPacket,
        coachingContext: buildAgentPromptContextFromPacket(contextPacket),
        capabilityTurnMetadata: {
          primaryCapabilityId: "attachment_food_photo",
          selectedCapabilityIds: ["attachment_food_photo"],
          compositionStrategy: "primary_only",
          widgetDescriptors: [],
          actionDescriptors: [],
        },
        routerTurn: createRouterTurn({
          routerRan: true,
          routerResult: {
            output: routerDecisionOutputSchema.parse({
              selectedDomains: [
                {
                  domain: "nutrition",
                  confidence: 0.86,
                  intentHints: [],
                  toolHints: [],
                  signalHints: [],
                },
              ],
              contextNeeds: [],
              safetyFlags: [],
              confidence: 0.86,
            }),
            source: "llm",
            validationErrors: [],
          },
        }),
        provider: { generateAgentLoopStep } as never,
      });

      expect(result.output.proposals).toEqual([]);
      expect(result.agentMetadata.safety.status).toBe(expectedSafetyStatus);
      expect(result.agentMetadata.unifiedTurnDecision?.blockedFallback).toBe(true);
    },
  );

  it("marks context expansion metadata for context_expansion_loop", async () => {
    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "final_answer",
      reply: "Here is your monthly review summary.",
      proposals: [],
    });
    const executor = new ResponseModeExecutorService(
      new ActionResolverService(),
      { executeTool: vi.fn() } as never,
    );
    const contextPacket = createContextPacket();
    const plan = createPlan({
      requiresCompression: true,
      executorMode: "context_expansion_loop",
    });

    await executor.execute({
      plan,
      orchestratorInput: {
        auth: {
          clerkUserId: "clerk-user",
          email: "test@example.com",
          displayName: "Test",
        },
        userMessage: "Review my progress this month",
        recentMessages: [],
      },
      contextPacket,
      coachingContext: {
        ...buildAgentPromptContextFromPacket(contextPacket),
        agentContext: { purpose: "weekly_review" },
        contextCompressionSummary: "Compressed monthly context",
      },
      capabilityTurnMetadata: {
        primaryCapabilityId: "review_progress",
        selectedCapabilityIds: ["review_progress"],
        compositionStrategy: "primary_only",
        widgetDescriptors: [],
        actionDescriptors: [],
      },
      routerTurn: createRouterTurn(),
      provider: { generateAgentLoopStep } as never,
    });

    const loopRequest = generateAgentLoopStep.mock.calls[0]?.[0] as {
      coachingContext: {
        agentContext?: Record<string, unknown>;
        responseModeExecutor?: { handlerPath?: string; useContextExpansionMetadata?: boolean };
      };
    };

    expect(loopRequest.coachingContext.responseModeExecutor).toMatchObject({
      handlerPath: "context_expansion_bounded_loop",
      useContextExpansionMetadata: true,
    });
    expect(loopRequest.coachingContext.agentContext?.contextExpansionLoop).toBe(true);
  });
});
