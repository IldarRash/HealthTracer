import type { AgentToolCallRequest, AgentToolCallResult, AgentToolName } from "@health/types";
import {
  agentGetDocumentContextToolResultSchema,
  agentGetUserContextSliceToolResultSchema,
  agentGetWeeklyProgressContextToolResultSchema,
  agentToolCallRequestSchema,
  agentToolCallResultSchema,
  getUserContextSliceInputSchema,
} from "@health/types";
import type { ZodError } from "zod";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { CoachingContextService } from "../coaching-context/coaching-context.service.js";

@Injectable()
export class AgentToolRegistryService {
  constructor(private readonly coachingContextService: CoachingContextService) {}

  listAvailableTools(): AgentToolName[] {
    return ["getUserContextSlice", "getDocumentContext", "getWeeklyProgressContext"];
  }

  async executeTool(
    auth: ClerkAuthContext,
    request: AgentToolCallRequest,
  ): Promise<AgentToolCallResult> {
    const parsedRequest = agentToolCallRequestSchema.safeParse(request);

    if (!parsedRequest.success) {
      return this.invalidToolCallResult(parsedRequest.error);
    }

    return this.executeValidatedTool(auth, parsedRequest.data);
  }

  private async executeValidatedTool(
    auth: ClerkAuthContext,
    request: AgentToolCallRequest,
  ): Promise<AgentToolCallResult> {
    switch (request.tool) {
      case "getUserContextSlice":
        return this.executeGetUserContextSlice(auth, request.input);
      case "getDocumentContext":
        return this.executeGetDocumentContext(auth);
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

  private async executeGetDocumentContext(auth: ClerkAuthContext): Promise<AgentToolCallResult> {
    const slice = await this.coachingContextService.getUserContextSlice(auth, {
      purpose: "health_context",
      includeDocuments: true,
      includeRawData: false,
    });

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
