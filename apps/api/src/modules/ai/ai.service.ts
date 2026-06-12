import type { AiStructuredOutput, AgentTurnMetadata, ProposalExplainerTurnContext, ProgressReporter, UserLocale, ChatTurnDegradedReason, ChatTurnError } from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import {
  AgentOrchestratorService,
  type AttachmentTurnContext,
  type ProposalRevisionContext,
} from "./agent-orchestrator.service.js";

const SAFE_FALLBACK_REPLY =
  "I could not safely process that response. Please try again with a wellness-focused question.";

export interface GenerateCoachResponseInput {
  auth: ClerkAuthContext;
  userMessage: string;
  /** Persisted user locale — the authoritative language hint for AI replies. */
  responseLocale?: UserLocale;
  recentMessages: ReadonlyArray<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  proposalRevision?: ProposalRevisionContext;
  proposalExplainer?: ProposalExplainerTurnContext;
  attachmentTurn?: AttachmentTurnContext;
  /**
   * Optional progress reporter for SSE streaming. Threaded through to the
   * orchestrator. Failures are swallowed — never breaks the turn.
   */
  onProgress?: ProgressReporter;
}

export interface GeneratedCoachResponse {
  output: AiStructuredOutput;
  parseErrors: string[];
  replySafetyErrors: string[];
  agentMetadata: AgentTurnMetadata;
  /**
   * COMPATIBILITY CODE (kept intentionally, per refactor-cleanup.md): plumbing
   * held for the deferred medical special-save flow. When true, the pipeline
   * resolved a consent-gated outcome; no client consumes the flag yet and
   * nothing is auto-persisted. Removal condition: remove end-to-end if the
   * special-save flow is descoped, or wire the client consent prompt when it
   * ships. Only set on fan-out turns; undefined otherwise.
   */
  consentRequired?: boolean;
  /**
   * Present when the AI pipeline produced a degraded/fallback reply.
   * Maps from agentMetadata.safety.status to a presentation-safe reason code.
   * Absent when the pipeline completed cleanly (safety.status === "passed").
   */
  degraded?: { reason: ChatTurnDegradedReason };
  /**
   * Present when the AI pipeline could not produce an honest reply.
   * reason=decision_failed: decision-maker failed after retry.
   * reason=reply_blocked: reply safety validation blocked the synthesized reply.
   * ChatService should persist an error marker instead of fake coach text.
   */
  turnError?: ChatTurnError;
}

@Injectable()
export class AiService {
  constructor(private readonly agentOrchestratorService: AgentOrchestratorService) {}

  async generateCoachResponse(
    input: GenerateCoachResponseInput,
  ): Promise<GeneratedCoachResponse> {
    const orchestrated = await this.agentOrchestratorService.orchestrateCoachTurn({
      ...input,
      responseLocale: input.responseLocale,
      onProgress: input.onProgress,
    });

    const safetyStatus = orchestrated.agentMetadata.safety?.status;
    // turnError (reply absent) and degraded (reply present) are disjoint by
    // contract: when turnError is set there is no usable reply and ChatService
    // persists the error marker, so no quality marker is derived. Only the
    // reply-present degradations (parse_failed, provider_error) map to degraded.
    const degradedReason: ChatTurnDegradedReason | undefined = orchestrated.turnError
      ? undefined
      : safetyStatus === "parse_failed"
        ? "parse_failed"
        : safetyStatus === "provider_error"
          ? "provider_error"
          : undefined;

    return {
      output: orchestrated.output,
      parseErrors: orchestrated.parseErrors,
      replySafetyErrors: orchestrated.replySafetyErrors,
      agentMetadata: orchestrated.agentMetadata,
      ...(orchestrated.consentRequired !== undefined
        ? { consentRequired: orchestrated.consentRequired }
        : {}),
      ...(degradedReason !== undefined ? { degraded: { reason: degradedReason } } : {}),
      ...(orchestrated.turnError !== undefined ? { turnError: orchestrated.turnError } : {}),
    };
  }

  getProviderMode() {
    return this.agentOrchestratorService.getProviderMode();
  }
}

export { SAFE_FALLBACK_REPLY };
