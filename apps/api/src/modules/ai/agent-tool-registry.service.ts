import type {
  AgentToolCallRequest,
  AgentToolCallResult,
  AgentToolName,
  ContextBudgetPolicy,
} from "@health/types";
import {
  agentGetDocumentContextToolResultSchema,
  agentGetUserContextSliceToolResultSchema,
  agentGetWeeklyProgressContextToolResultSchema,
  agentToolCallRequestSchema,
  agentToolCallResultSchema,
  getUserContextSliceInputSchema,
  DEFAULT_CONTEXT_BUDGET_POLICY,
} from "@health/types";
import type { ZodError } from "zod";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { CoachingContextService } from "../coaching-context/coaching-context.service.js";
import { ContextBudgetPolicyService } from "../coaching-context/context-budget-policy.service.js";

@Injectable()
export class AgentToolRegistryService {
  constructor(
    private readonly coachingContextService: CoachingContextService,
    private readonly contextBudgetPolicyService: ContextBudgetPolicyService,
  ) {}

  listAvailableTools(): AgentToolName[] {
    return ["getUserContextSlice", "getDocumentContext", "getWeeklyProgressContext"];
  }

  /**
   * Execute a tool request from a domain loop after executor allowlist checks.
   *
   * @param contextBudget - The active per-domain context budget. Required for
   *   `getDocumentContext` to re-apply the deny-by-default document floor.
   *   When omitted, `DEFAULT_CONTEXT_BUDGET_POLICY` is used as the conservative
   *   fallback (allowDocuments=false, allowSensitiveHealthContext=false).
   */
  async executeTool(
    auth: ClerkAuthContext,
    request: AgentToolCallRequest,
    contextBudget?: ContextBudgetPolicy,
  ): Promise<AgentToolCallResult> {
    const parsedRequest = agentToolCallRequestSchema.safeParse(request);

    if (!parsedRequest.success) {
      return this.invalidToolCallResult(parsedRequest.error);
    }

    return this.executeValidatedTool(auth, parsedRequest.data, contextBudget);
  }

  private async executeValidatedTool(
    auth: ClerkAuthContext,
    request: AgentToolCallRequest,
    contextBudget?: ContextBudgetPolicy,
  ): Promise<AgentToolCallResult> {
    switch (request.tool) {
      case "getUserContextSlice":
        return this.executeGetUserContextSlice(auth, request.input);
      case "getDocumentContext":
        return this.executeGetDocumentContext(auth, contextBudget);
      case "getWeeklyProgressContext":
        return this.executeGetWeeklyProgressContext(auth);
      default: {
        const _exhaustive: never = request.tool;
        return this.unsupportedToolResult(_exhaustive);
      }
    }
  }

  private invalidToolCallResult(error: ZodError): AgentToolCallResult {
    return agentToolCallResultSchema.parse({
      tool: "getUserContextSlice",
      ok: false,
      errors: error.issues.map(
        (issue) => `${issue.path.join(".") || "request"}: ${issue.message}`,
      ),
    });
  }

  private unsupportedToolResult(tool: string): AgentToolCallResult {
    return agentToolCallResultSchema.parse({
      tool: "getUserContextSlice",
      ok: false,
      errors: [`Unsupported tool: ${tool}`],
    });
  }

  private async executeGetUserContextSlice(
    auth: ClerkAuthContext,
    input: Record<string, unknown>,
  ): Promise<AgentToolCallResult> {
    const parsed = getUserContextSliceInputSchema.safeParse(input);

    if (!parsed.success) {
      return agentToolCallResultSchema.parse({
        tool: "getUserContextSlice",
        ok: false,
        errors: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "input"}: ${issue.message}`,
        ),
      });
    }

    const slice = await this.coachingContextService.getUserContextSlice(auth, parsed.data);
    const validated = agentGetUserContextSliceToolResultSchema.safeParse(slice);

    if (!validated.success) {
      return agentToolCallResultSchema.parse({
        tool: "getUserContextSlice",
        ok: false,
        errors: validated.error.issues.map(
          (issue) => `${issue.path.join(".") || "result"}: ${issue.message}`,
        ),
      });
    }

    return agentToolCallResultSchema.parse({
      tool: "getUserContextSlice",
      ok: true,
      result: validated.data,
    });
  }

  /**
   * Execute the `getDocumentContext` tool.
   *
   * Safety floor (MUST NOT be weakened):
   *  - The slice is always routed through `applyBudgetToBuiltSlice` using the
   *    active per-domain context budget. The budget's `allowDocuments` and
   *    `allowSensitiveHealthContext` flags are the code-level deny-by-default
   *    floors — config cannot relax them.
   *  - When `contextBudget` is not supplied (legacy or test callers), we fall
   *    back to `DEFAULT_CONTEXT_BUDGET_POLICY` which denies documents and
   *    sensitive health context. This means the tool produces an empty document
   *    result when no explicit budget is passed, which is the safe default.
   *  - Document content returned is consent-approved, summarized references only
   *    (no raw document contents) — enforced by `getUserContextSlice` + budget.
   */
  private async executeGetDocumentContext(
    auth: ClerkAuthContext,
    contextBudget?: ContextBudgetPolicy,
  ): Promise<AgentToolCallResult> {
    const activeBudget = contextBudget ?? DEFAULT_CONTEXT_BUDGET_POLICY;

    const rawSlice = await this.coachingContextService.getUserContextSlice(auth, {
      purpose: "health_context",
      includeDocuments: true,
      includeRawData: false,
    });

    // Re-apply the active per-domain context budget floor AFTER building the slice.
    // This is the deny-by-default enforcement: if the budget denies documents or
    // sensitive health context, those fields are stripped here even though
    // getUserContextSlice was called with includeDocuments:true.
    // The budget floor is a code-level invariant — it is not relaxable by config.
    const slice = this.contextBudgetPolicyService.applyBudgetToBuiltSlice(rawSlice, activeBudget);

    const result = {
      documentContext: slice.documentContext ?? {
        items: [],
        generatedAt: new Date().toISOString(),
      },
      ragResults: slice.ragResults ?? [],
    };
    const validated = agentGetDocumentContextToolResultSchema.safeParse(result);

    if (!validated.success) {
      return agentToolCallResultSchema.parse({
        tool: "getDocumentContext",
        ok: false,
        errors: validated.error.issues.map(
          (issue) => `${issue.path.join(".") || "result"}: ${issue.message}`,
        ),
      });
    }

    return agentToolCallResultSchema.parse({
      tool: "getDocumentContext",
      ok: true,
      result: validated.data,
    });
  }

  private async executeGetWeeklyProgressContext(
    auth: ClerkAuthContext,
  ): Promise<AgentToolCallResult> {
    const slice = await this.coachingContextService.getUserContextSlice(auth, {
      purpose: "weekly_review",
      includeRawData: false,
      includeDocuments: false,
    });

    const result = slice.weeklyProgress ?? null;
    const validated = agentGetWeeklyProgressContextToolResultSchema.safeParse(result);

    if (!validated.success) {
      return agentToolCallResultSchema.parse({
        tool: "getWeeklyProgressContext",
        ok: false,
        errors: validated.error.issues.map(
          (issue) => `${issue.path.join(".") || "result"}: ${issue.message}`,
        ),
      });
    }

    return agentToolCallResultSchema.parse({
      tool: "getWeeklyProgressContext",
      ok: true,
      result: validated.data,
    });
  }
}
