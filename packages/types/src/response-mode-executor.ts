import { z } from "zod";
import {
  MAX_AGENT_LOOP_ITERATIONS,
  type ContextDepth,
  type ExpectedResponseMode,
  type IntentRouteResult,
} from "./agent-context.js";
import { expectedResponseModeSchema } from "./agent-context.js";
import type { DirectChatPathCandidate } from "./direct-chat-path.js";

export const responseModeExecutorModeSchema = z.enum([
  "deterministic_read",
  "deterministic_write",
  "single_llm",
  "context_aware_llm",
  "proposal_flow",
  "context_expansion_loop",
]);

export type ResponseModeExecutorMode = z.infer<typeof responseModeExecutorModeSchema>;

export const responseModeExecutorHandlerPathSchema = z.enum([
  "single_final_answer",
  "bounded_tool_loop",
  "proposal_bounded_loop",
  "context_expansion_bounded_loop",
]);

export type ResponseModeExecutorHandlerPath = z.infer<
  typeof responseModeExecutorHandlerPathSchema
>;

export const responseModeExecutionMetadataSchema = z.object({
  executorMode: responseModeExecutorModeSchema,
  llmInvoked: z.boolean(),
  expectedResponseMode: expectedResponseModeSchema,
  handlerPath: responseModeExecutorHandlerPathSchema.optional(),
  maxLoopIterations: z.number().int().min(0).max(MAX_AGENT_LOOP_ITERATIONS).optional(),
  allowToolLoop: z.boolean().optional(),
  useContextExpansionMetadata: z.boolean().optional(),
});

export type ResponseModeExecutionMetadata = z.infer<typeof responseModeExecutionMetadataSchema>;

export interface ResolveResponseModeExecutorModeInput {
  route: IntentRouteResult;
  expectedResponseMode: ExpectedResponseMode;
  requiresCompression: boolean;
  allowedProposalIntents: readonly string[];
  allowedTools: readonly string[];
  directPathCandidate?: DirectChatPathCandidate | null;
}

const DETERMINISTIC_EXECUTOR_MODES = new Set<ResponseModeExecutorMode>([
  "deterministic_read",
  "deterministic_write",
]);

export function isDeterministicResponseModeExecutorMode(
  mode: ResponseModeExecutorMode,
): boolean {
  return DETERMINISTIC_EXECUTOR_MODES.has(mode);
}

export function isLlmResponseModeExecutorMode(mode: ResponseModeExecutorMode): boolean {
  return !isDeterministicResponseModeExecutorMode(mode);
}

function resolveDirectPathExecutorMode(
  candidate: DirectChatPathCandidate,
): ResponseModeExecutorMode {
  switch (candidate.kind) {
    case "today_summary_read":
      return "deterministic_read";
    case "mark_today_workout_done":
      return "deterministic_write";
    case "nutrition_plan_read":
      return "deterministic_read";
  }
}

function isContextAwareRoute(route: IntentRouteResult, depth: ContextDepth): boolean {
  return (
    route.routingMethod === "unified_turn_decision" ||
    route.requiredContextSlices.length > 1 ||
    depth === "large"
  );
}

/**
 * Maps planner signals to executor modes. Legacy {@link ExpectedResponseMode} values remain
 * unchanged on routes; this adapter selects the execution path without breaking compatibility.
 */
export function resolveResponseModeExecutorMode(
  input: ResolveResponseModeExecutorModeInput,
): ResponseModeExecutorMode {
  if (input.directPathCandidate) {
    return resolveDirectPathExecutorMode(input.directPathCandidate);
  }

  if (input.requiresCompression) {
    return "context_expansion_loop";
  }

  const proposalsAllowed =
    input.allowedProposalIntents.length > 0 &&
    input.expectedResponseMode !== "advice_only";

  if (proposalsAllowed) {
    return "proposal_flow";
  }

  if (isContextAwareRoute(input.route, input.route.depth)) {
    return "context_aware_llm";
  }

  return "single_llm";
}

export function mapExpectedResponseModeToDefaultExecutorMode(
  expectedResponseMode: ExpectedResponseMode,
): ResponseModeExecutorMode {
  switch (expectedResponseMode) {
    case "advice_only":
      return "single_llm";
    case "clarification_question":
      return "single_llm";
    case "recommendation_with_optional_proposal":
      return "proposal_flow";
  }
}

export interface ResponseModeExecutorLoopPolicy {
  handlerPath: ResponseModeExecutorHandlerPath;
  maxLoopIterations: number;
  allowToolLoop: boolean;
  useContextExpansionMetadata: boolean;
}

export function resolveResponseModeExecutorLoopPolicy(
  mode: ResponseModeExecutorMode,
): ResponseModeExecutorLoopPolicy {
  switch (mode) {
    case "deterministic_read":
    case "deterministic_write":
      // Deterministic modes are handled by the pre-AI gate before the orchestrator.
      // The SystemPlanner coerces them to fan-out, so these cases never reach the
      // executor metadata builder in the live pipeline. The loop policy is a safe
      // no-op default; the handler path is absent (not "pre_ai_gate_delegation").
      return {
        handlerPath: "single_final_answer",
        maxLoopIterations: 0,
        allowToolLoop: false,
        useContextExpansionMetadata: false,
      };
    case "single_llm":
      return {
        handlerPath: "single_final_answer",
        maxLoopIterations: 1,
        allowToolLoop: false,
        useContextExpansionMetadata: false,
      };
    case "context_aware_llm":
      return {
        handlerPath: "bounded_tool_loop",
        maxLoopIterations: MAX_AGENT_LOOP_ITERATIONS,
        allowToolLoop: true,
        useContextExpansionMetadata: false,
      };
    case "proposal_flow":
      return {
        handlerPath: "proposal_bounded_loop",
        maxLoopIterations: MAX_AGENT_LOOP_ITERATIONS,
        allowToolLoop: true,
        useContextExpansionMetadata: false,
      };
    case "context_expansion_loop":
      return {
        handlerPath: "context_expansion_bounded_loop",
        maxLoopIterations: MAX_AGENT_LOOP_ITERATIONS,
        allowToolLoop: true,
        useContextExpansionMetadata: true,
      };
  }
}

export function buildResponseModeExecutionMetadata(input: {
  executorMode: ResponseModeExecutorMode;
  llmInvoked: boolean;
  expectedResponseMode: ExpectedResponseMode;
}): ResponseModeExecutionMetadata {
  const loopPolicy = resolveResponseModeExecutorLoopPolicy(input.executorMode);

  return {
    executorMode: input.executorMode,
    llmInvoked: input.llmInvoked,
    expectedResponseMode: input.expectedResponseMode,
    handlerPath: loopPolicy.handlerPath,
    maxLoopIterations: loopPolicy.maxLoopIterations,
    allowToolLoop: loopPolicy.allowToolLoop,
    useContextExpansionMetadata: loopPolicy.useContextExpansionMetadata,
  };
}
