import type { CoachAiProvider } from "@health/ai";
import type {
  MessagePreprocessorResult,
  RouterDecisionOutput,
  RouterDecisionRequest,
} from "@health/types";
import {
  clampRouterDecisionOutput,
  createFallbackRouterDecision,
  routerDecisionOutputSchema,
  routerDecisionRequestSchema,
  routerDomainSchema,
  validateRouterDecisionOutputShape,
  type RouterAttachmentHint,
  type RouterAvailableDomain,
  type RouterDomain,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import { createCoachAiProvider } from "./coach-provider.factory.js";

// ---------------------------------------------------------------------------
// Input / result types
// ---------------------------------------------------------------------------

export interface RouterLlmServiceAttachmentHint {
  readonly category: string;
  readonly mimeType?: string;
  readonly consentState?: "granted" | "needs_consent" | "not_required";
}

export interface RouterLlmServiceInput {
  readonly preprocessorResult: MessagePreprocessorResult;
  readonly attachmentHints?: ReadonlyArray<RouterLlmServiceAttachmentHint>;
  readonly recentMessages?: ReadonlyArray<{
    readonly role: "user" | "assistant" | "system";
    readonly content: string;
  }>;
}

export interface RouterLlmResult {
  readonly output: RouterDecisionOutput;
  readonly source: "llm" | "fallback";
  readonly validationErrors: readonly string[];
}

// ---------------------------------------------------------------------------
// Safety guardrails sent to the LLM (code-level floor, config cannot relax)
// ---------------------------------------------------------------------------

const ROUTER_SAFETY_GUARDRAILS: readonly string[] = [
  "Select domains only — do not emit replies, proposals, or direct coaching text.",
  "Do not include diagnosis, treatment, or medical-certainty language in hints.",
  "Domain selection is read-only routing — the domain LLMs produce all coaching output.",
  "Respect safety signals: fatigue, pain, sleep issues — route to health domain when present.",
];

// How many recent message hints to include in the router request.
const MAX_RECENT_MESSAGE_HINTS = 6 as const;

@Injectable()
export class RouterLlmService {
  private readonly provider: CoachAiProvider;

  constructor(
    private readonly aiBehaviorConfigService: AiBehaviorConfigService,
    private readonly capabilityRegistryService: CapabilityRegistryService,
  ) {
    this.provider = createCoachAiProvider(
      this.aiBehaviorConfigService.getCompiledPromptTemplates(),
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Run the first-LLM routing stage.
   *
   * Returns a clamped, read-only RouterDecisionOutput. The output never contains
   * replies, proposals, or tool calls — only domain routing hints. On any
   * provider failure the service falls back to createFallbackRouterDecision so
   * downstream stages always receive a valid (possibly empty) output.
   */
  async route(input: RouterLlmServiceInput): Promise<RouterLlmResult> {
    const request = this.buildRequest(input);

    try {
      const rawOutput = await this.provider.generateRouterDecision(request);
      const shapeErrors = validateRouterDecisionOutputShape(rawOutput);

      if (shapeErrors.length > 0) {
        return {
          output: createFallbackRouterDecision(),
          source: "fallback",
          validationErrors: shapeErrors,
        };
      }

      // Parse FIRST so .default([]) transforms are applied to the raw provider output
      // before clampRouterDecisionOutput filters them. Without this step the clamp
      // receives un-defaulted values (e.g. missing selectedDomains) and only survives
      // via the outer try/catch. Carry-forward nit #1.
      const parsedOutput = routerDecisionOutputSchema.parse(rawOutput);
      const clampedOutput = clampRouterDecisionOutput(parsedOutput);

      return {
        output: clampedOutput,
        source: "llm",
        validationErrors: [],
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Router LLM provider call failed.";

      return {
        output: createFallbackRouterDecision(),
        source: "fallback",
        validationErrors: [message],
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Request builder (testable separately)
  // ---------------------------------------------------------------------------

  buildRequest(input: RouterLlmServiceInput): RouterDecisionRequest {
    const preprocessor = input.preprocessorResult;

    // Build available-domain list from domain configs intersected with the
    // capability catalog. Each entry maps to the RouterDomain enum values.
    const availableDomains = this.buildAvailableDomains();

    // Clamp and normalise attachment hints into the schema shape.
    const attachmentHints: RouterAttachmentHint[] = (input.attachmentHints ?? [])
      .slice(0, 5)
      .map((hint) => ({
        category: hint.category,
        ...(hint.mimeType !== undefined ? { mimeType: hint.mimeType } : {}),
        ...(hint.consentState !== undefined ? { consentState: hint.consentState } : {}),
      }));

    // Limit recent messages to a small window — the router needs context hints
    // only, not the full conversation history.
    const recentMessageHints = (input.recentMessages ?? [])
      .slice(-MAX_RECENT_MESSAGE_HINTS)
      .map((msg) => ({ role: msg.role, content: msg.content.slice(0, 4000) }));

    return routerDecisionRequestSchema.parse({
      originalText: preprocessor.originalText,
      normalizedText: preprocessor.normalizedText,
      detectedLanguage: preprocessor.detectedLanguage ?? undefined,
      preprocessor,
      attachmentHints,
      recentMessageHints,
      availableDomains,
      safetyGuardrails: [...ROUTER_SAFETY_GUARDRAILS],
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildAvailableDomains(): RouterAvailableDomain[] {
    const domainConfigBundle = this.aiBehaviorConfigService.getDomainConfigs();
    const result: RouterAvailableDomain[] = [];

    for (const rawDomain of routerDomainSchema.options as RouterDomain[]) {
      // router-decision.ts only exposes workout/nutrition/health as RouterDomain;
      // medical folds into health per the architecture spec.
      const domainConfig = domainConfigBundle[rawDomain];

      if (!domainConfig) {
        continue;
      }

      // Collect capability ids this domain maps to (from intents).
      const capabilityIds = [
        ...new Set(domainConfig.intents.map((intent) => intent.mapsToCapabilityId)),
      ].filter((capabilityId) => {
        // Verify the capability still exists in the registry (catalog intersection).
        try {
          this.capabilityRegistryService.getConfig(capabilityId);
          return true;
        } catch {
          return false;
        }
      });

      // Build human-readable intent summaries for the LLM.
      const intentSummaries = domainConfig.intents
        .map((intent) => intent.description)
        .slice(0, 10);

      result.push({
        domain: rawDomain,
        capabilityIds,
        intentSummaries,
      });
    }

    return result;
  }
}
