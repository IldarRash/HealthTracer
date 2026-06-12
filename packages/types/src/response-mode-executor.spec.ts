import { describe, expect, it } from "vitest";
import { buildRouteFromCatalogIntent } from "./agent-context.js";
import { MAX_AGENT_LOOP_ITERATIONS } from "./agent-context.js";
import {
  isDeterministicResponseModeExecutorMode,
  isLlmResponseModeExecutorMode,
  mapExpectedResponseModeToDefaultExecutorMode,
  resolveResponseModeExecutorLoopPolicy,
  resolveResponseModeExecutorMode,
} from "./response-mode-executor.js";

function baseRoute(
  overrides: Partial<Parameters<typeof buildRouteFromCatalogIntent>[0]> = {},
) {
  return buildRouteFromCatalogIntent({
    catalogIntentId: "general",
    mappedAgentIntent: "general",
    confidence: 0.9,
    routingMethod: "rule_based",
    ...overrides,
  });
}

describe("resolveResponseModeExecutorMode", () => {
  it("maps direct read paths to deterministic_read", () => {
    expect(
      resolveResponseModeExecutorMode({
        route: baseRoute(),
        expectedResponseMode: "advice_only",
        requiresCompression: false,
        allowedProposalIntents: [],
        allowedTools: [],
        directPathCandidate: {
          kind: "today_summary_read",
          confidence: 0.95,
          routingMethod: "rule_based",
        },
      }),
    ).toBe("deterministic_read");
  });

  it("maps direct write paths to deterministic_write", () => {
    expect(
      resolveResponseModeExecutorMode({
        route: baseRoute(),
        expectedResponseMode: "advice_only",
        requiresCompression: false,
        allowedProposalIntents: [],
        allowedTools: [],
        directPathCandidate: {
          kind: "mark_today_workout_done",
          confidence: 0.95,
          routingMethod: "rule_based",
        },
      }),
    ).toBe("deterministic_write");
  });

  it("maps compression-required turns to context_expansion_loop", () => {
    expect(
      resolveResponseModeExecutorMode({
        route: baseRoute({ catalogIntentId: "review_progress", mappedAgentIntent: "review_progress" }),
        expectedResponseMode: "recommendation_with_optional_proposal",
        requiresCompression: true,
        allowedProposalIntents: ["update_workout_plan"],
        allowedTools: [],
      }),
    ).toBe("context_expansion_loop");
  });

  it("maps proposal-capable capabilities to proposal_flow", () => {
    expect(
      resolveResponseModeExecutorMode({
        route: baseRoute({ catalogIntentId: "adjust_workout", mappedAgentIntent: "adjust_workout" }),
        expectedResponseMode: "recommendation_with_optional_proposal",
        requiresCompression: false,
        allowedProposalIntents: ["update_workout_plan"],
        allowedTools: [],
      }),
    ).toBe("proposal_flow");
  });

  it("maps unified turn decision routes to context_aware_llm when not proposal-first", () => {
    expect(
      resolveResponseModeExecutorMode({
        route: baseRoute({
          catalogIntentId: "general",
          mappedAgentIntent: "general",
          routingMethod: "unified_turn_decision",
        }),
        expectedResponseMode: "advice_only",
        requiresCompression: false,
        allowedProposalIntents: [],
        allowedTools: [],
      }),
    ).toBe("context_aware_llm");
  });

  it("defaults advice-only turns to single_llm", () => {
    expect(
      resolveResponseModeExecutorMode({
        route: baseRoute({ catalogIntentId: "proposal_explainer", mappedAgentIntent: "proposal_explainer" }),
        expectedResponseMode: "advice_only",
        requiresCompression: false,
        allowedProposalIntents: [],
        allowedTools: [],
      }),
    ).toBe("single_llm");
  });
});

describe("response mode executor helpers", () => {
  it("classifies deterministic and llm modes", () => {
    expect(isDeterministicResponseModeExecutorMode("deterministic_read")).toBe(true);
    expect(isDeterministicResponseModeExecutorMode("single_llm")).toBe(false);
    expect(isLlmResponseModeExecutorMode("proposal_flow")).toBe(true);
  });

  it("maps legacy expected response modes without breaking compatibility", () => {
    expect(mapExpectedResponseModeToDefaultExecutorMode("advice_only")).toBe("single_llm");
    expect(mapExpectedResponseModeToDefaultExecutorMode("recommendation_with_optional_proposal")).toBe(
      "proposal_flow",
    );
  });

  it("assigns distinct loop policies per executor mode", () => {
    expect(resolveResponseModeExecutorLoopPolicy("single_llm")).toMatchObject({
      handlerPath: "single_final_answer",
      maxLoopIterations: 1,
      allowToolLoop: false,
    });
    expect(resolveResponseModeExecutorLoopPolicy("proposal_flow")).toMatchObject({
      handlerPath: "proposal_bounded_loop",
      maxLoopIterations: MAX_AGENT_LOOP_ITERATIONS,
      allowToolLoop: true,
    });
    expect(resolveResponseModeExecutorLoopPolicy("context_expansion_loop")).toMatchObject({
      handlerPath: "context_expansion_bounded_loop",
      useContextExpansionMetadata: true,
    });
    // Deterministic modes are coerced to fan-out by SystemPlanner before reaching the
    // orchestrator, so the handler path "pre_ai_gate_delegation" no longer applies.
    // The fallback is "single_final_answer" with maxLoopIterations=0 as a safe no-op.
    expect(resolveResponseModeExecutorLoopPolicy("deterministic_read")).toMatchObject({
      handlerPath: "single_final_answer",
      maxLoopIterations: 0,
    });
  });
});
