import type { AiStructuredOutput, AgentTurnMetadata, ProposalExplainerTurnContext, ProgressReporter, UserLocale, ChatTurnDegradedReason } from "@health/types";
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
   * Whether the AI pipeline resolved a consent-gated outcome (e.g. a medical
   * document save proposal). When true, ChatService surfaces a distinct consent
   * prompt flag in the turn response. Nothing is auto-persisted.
   * Only set on fan-out turns; undefined otherwise.
   */
  consentRequired?: boolean;
  /**
   * Present when the AI pipeline produced a degraded/fallback reply.
   * Maps from agentMetadata.safety.status to a presentation-safe reason code.
   * Absent when the pipeline completed cleanly (safety.status === "passed").
   */
  degraded?: { reason: ChatTurnDegradedReason };
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
    const degradedReason: ChatTurnDegradedReason | undefined =
      safetyStatus === "reply_blocked"
        ? "reply_blocked"
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
    };
  }

  getProviderMode() {
    return this.agentOrchestratorService.getProviderMode();
  }
}

export { SAFE_FALLBACK_REPLY };
