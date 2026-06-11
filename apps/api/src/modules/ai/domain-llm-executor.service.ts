/**
 * DomainLlmExecutorService
 *
 * Runs ONE domain LLM bounded loop. The orchestrator invokes the selected
 * domain executors concurrently (Promise.all). Fan-out owns all turn types;
 * the legacy ResponseModeExecutorService was removed in C6.
 *
 * Failure isolation contract (MUST NOT be weakened):
 *  - Any throw, loop-exhaustion, reply-safety block, or per-domain timeout
 *    degrades to createFallbackDomainAnswer(domain) and records metadata.
 *  - The fallback is NEVER a rejection — the executor always resolves.
 *  - Per-domain timeout is enforced via Promise.race with a rejection-free timer.
 *  - This service must never crash the turn or block sibling domain executors.
 *
 * Per-domain isolation contract (MUST NOT be weakened):
 *  - Every tool request is checked against the domain's own allowedTools list
 *    (from DomainFanoutEntry). A tool not in the domain's allowlist is rejected
 *    immediately with a fallback — it never falls through to AgentToolRegistryService.
 *  - One domain cannot use another domain's tools or proposals.
 *  - Context-budget safety floors (documents/sensitive denied by default) are
 *    enforced per domain packet by CoachingContextService before this service runs;
 *    this service does not relax them.
 */

import { validateReplySafety, type CoachAiProvider, type ProviderUsage } from "@health/ai";
import type {
  AgentContextPacket,
  AgentToolCallResult,
  AgentToolName,
  DomainAttachmentContext,
  DomainAttachmentItem,
  RouterDomain,
} from "@health/types";
import {
  createFallbackDomainAnswer,
  domainAnswerSchema,
  domainLlmStepRequestSchema,
  validateDomainLlmStepOutputShape,
  type DomainAnswer,
  type DomainLlmStepRequest,
} from "@health/types";
import { Injectable, Logger } from "@nestjs/common";
import type { AttachmentTextExtractionResult } from "../chat-attachments/attachment-text-extraction.service.js";
import { ChatAttachmentsService } from "../chat-attachments/chat-attachments.service.js";
import { AgentToolRegistryService } from "./agent-tool-registry.service.js";
import type { DomainFanoutEntry } from "./system-planner.service.js";
import type { AttachmentTurnContextItem, OrchestrateCoachTurnInput } from "./agent-orchestrator.service.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Per-domain LLM call timeout in milliseconds.
 * A domain that does not resolve within this window is degraded to a safe
 * empty fallback. The timeout is bounded at the executor level so a slow
 * domain LLM call never blocks the turn.
 */
const DOMAIN_LLM_TIMEOUT_MS = 30_000 as const;

/**
 * Maximum iterations per domain loop. Mirrors MAX_AGENT_LOOP_ITERATIONS from
 * packages/types but scoped here to avoid an import from the constant (the
 * loop policy is derived from the DomainFanoutEntry.executorMode in Phase 5;
 * for Phase 4 we cap at 3 to match the existing bounded-loop contract).
 */
const DOMAIN_MAX_LOOP_ITERATIONS = 3 as const;

/**
 * Maximum raw byte size for an image loaded from storage into a vision data URI.
 * Images exceeding this limit are skipped (the domain LLM falls back to text metadata).
 * 4 MiB raw → ~5.5 MiB base64 — keeps individual vision calls well below OpenAI's
 * 20 MiB per-request limit, even with multiple attachments.
 */
const IMAGE_DATA_URI_MAX_BYTES = 4 * 1024 * 1024; // 4 MiB

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface DomainLlmExecutorInput {
  /**
   * Per-domain fan-out entry from SystemPlannerService.
   * Contains the domain discriminator, clamped allowlists, context budget,
   * and executor mode. Safety floors are already applied to contextBudget.
   */
  domainEntry: DomainFanoutEntry;
  /**
   * Bounded context packet built by CoachingContextService for this domain.
   * Safety floors (documents/sensitive denied by default) are re-applied by
   * CoachingContextService before this service receives it; do not re-open them.
   */
  contextPacket: AgentContextPacket;
  /**
   * Provider prompt context derived from the contextPacket.
   * Read-only — tool results are appended per iteration into a local copy.
   */
  coachingContext: Readonly<Record<string, unknown>>;
  /**
   * Original orchestrator input (userMessage, recentMessages, auth).
   */
  orchestratorInput: OrchestrateCoachTurnInput;
  /**
   * The instantiated coach AI provider for this turn.
   */
  provider: CoachAiProvider;
  /**
   * Resolved response language (hint ?? detected). Null/absent = fall back to message detection.
   * Threaded into the domain step request so the domain LLM writes in the correct language.
   */
  responseLanguage?: string | null;
  /**
   * Pre-extracted text content from document_file attachments (extracted once per turn
   * by AttachmentTextExtractionService before the domain fan-out). Populated for ALL
   * selected domains — workout included. Text is ephemeral context only (never persisted).
   * Empty map when no document attachments were present or all extractions degraded.
   */
  attachmentTextMap?: ReadonlyMap<string, AttachmentTextExtractionResult>;
}

export interface DomainLlmExecutorResult {
  /** Final domain answer, either from the LLM or a safe fallback. */
  domainAnswer: DomainAnswer;
  /**
   * Deterministic id→candidate map built from domainAnswer.candidateProposals[].
   * Key: `cand_<domain>_<index>` (e.g. "cand_workout_0").
   * Value: the candidate proposal record (untyped, Zod-validated by ProposalValidationService).
   * Empty on degraded/fallback results. Used by ActionResolverService for selection-by-ID.
   */
  candidateMap: ReadonlyMap<string, Record<string, unknown>>;
  /**
   * True when the result is a safe fallback produced by degradation (timeout,
   * loop exhaustion, safety block, provider error). Callers (orchestrator) use
   * this to record degraded-domain metadata.
   */
  degraded: boolean;
  /** Reason(s) for degradation when degraded=true. */
  degradedReasons: string[];
  /**
   * Accumulated token + latency usage across all loop iterations.
   * Absent on timeout/fallback paths where the provider was never called.
   */
  usage?: ProviderUsage;
  /** Number of loop iterations executed (0 on immediate degradation). */
  loopIterations: number;
  /** Tool names invoked in order during the loop. */
  toolsInvoked: AgentToolName[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DomainLlmExecutorService {
  private readonly logger = new Logger(DomainLlmExecutorService.name);

  constructor(
    private readonly agentToolRegistryService: AgentToolRegistryService,
    private readonly chatAttachmentsService: ChatAttachmentsService,
  ) {}

  /**
   * Run one domain's bounded LLM loop.
   *
   * Always resolves — never rejects. Any error path degrades to a safe fallback.
   * Per-domain timeout via Promise.race ensures a slow domain never blocks
   * the turn or sibling domain executors.
   *
   * An AbortController is tied to the timeout so that when the timeout fires,
   * any in-flight fetch (including retries) is cancelled via the AbortSignal.
   */
  async runDomainLoop(input: DomainLlmExecutorInput): Promise<DomainLlmExecutorResult> {
    const { domainEntry } = input;
    const domain = domainEntry.domain;

    const abortController = new AbortController();

    // Wrap the bounded loop in Promise.race with a per-domain timeout.
    // The timeout NEVER rejects — it resolves to a fallback so the outer
    // Promise.all in the orchestrator is not poisoned by a slow domain.
    const loopPromise = this.executeDomainLoopSafe(input, abortController.signal);
    const timeoutPromise = this.buildTimeoutFallback(domain, abortController);

    return Promise.race([loopPromise, timeoutPromise]);
  }

  // ---------------------------------------------------------------------------
  // Private — loop execution
  // ---------------------------------------------------------------------------

  /**
   * Safe wrapper around the bounded domain loop.
   * Catches all thrown errors (including AbortError from the timeout signal) and
   * degrades to a fallback.
   * Never rejects.
   */
  private async executeDomainLoopSafe(
    input: DomainLlmExecutorInput,
    signal: AbortSignal,
  ): Promise<DomainLlmExecutorResult> {
    try {
      return await this.executeDomainLoop(input, signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown domain executor error.";
      return this.buildFallbackResult(input.domainEntry.domain, [message], 0, []);
    }
  }

  /**
   * Core bounded domain loop — may throw; callers wrap with executeDomainLoopSafe.
   * The signal is from the per-domain AbortController tied to the timeout so that
   * in-flight fetch retries are cancelled when the timeout fires.
   */
  private async executeDomainLoop(
    input: DomainLlmExecutorInput,
    signal: AbortSignal,
  ): Promise<DomainLlmExecutorResult> {
    const { domainEntry, contextPacket, orchestratorInput, provider } = input;
    const domain = domainEntry.domain;

    const toolsInvoked: AgentToolName[] = [];
    const priorToolResults: AgentToolCallResult[] = [];
    let accumulatedUsage: ProviderUsage | undefined;

    // Build a mutable local copy of coaching context so we can append tool results
    // per iteration without mutating the shared input reference.
    const coachingContext: Record<string, unknown> = { ...input.coachingContext };

    // Build bounded attachment context for this domain step.
    // All attachments flow to every selected domain; imageDataUri is populated
    // for nutrition/health domains with image-MIME attachments; textContent and
    // filename are populated for document_file MIMEs on ALL selected domains.
    const attachmentContext = await this.buildAttachmentContext(
      orchestratorInput.attachmentTurn?.attachments,
      domain,
      input.attachmentTextMap,
    );

    // Build the base step request once; we will update iteration + priorToolResults per step.
    const baseRequest: Omit<DomainLlmStepRequest, "iteration" | "priorToolResults"> = {
      domain,
      maxIterations: DOMAIN_MAX_LOOP_ITERATIONS,
      userMessage: orchestratorInput.userMessage,
      recentMessages: [...orchestratorInput.recentMessages].slice(-10).map((m) => ({
        role: m.role,
        content: m.content.slice(0, 4000),
      })),
      coachingContext,
      allowedTools: [...domainEntry.allowedTools],
      allowedProposalIntents: [...domainEntry.allowedProposalIntents],
      safetyFlags: [],
      safetyConstraints: [...contextPacket.safetyConstraints],
      ...(attachmentContext !== undefined ? { attachmentContext } : {}),
      ...(input.responseLanguage != null ? { responseLanguage: input.responseLanguage } : {}),
    };

    for (let iteration = 1; iteration <= DOMAIN_MAX_LOOP_ITERATIONS; iteration += 1) {
      // Assemble the fully-typed step request and validate it before calling provider.
      const stepRequest = domainLlmStepRequestSchema.parse({
        ...baseRequest,
        iteration,
        priorToolResults: [...priorToolResults],
      });

      // Provider returns ProviderCallResult; unwrap the output and accumulate usage.
      // Pass the abort signal so in-flight retries are cancelled when the timeout fires.
      const { output: rawOutput, usage: stepUsage } = await provider.generateDomainStep(stepRequest, { signal });

      if (stepUsage) {
        accumulatedUsage = accumulatedUsage
          ? {
              promptTokens: accumulatedUsage.promptTokens + stepUsage.promptTokens,
              completionTokens: accumulatedUsage.completionTokens + stepUsage.completionTokens,
              totalTokens: accumulatedUsage.totalTokens + stepUsage.totalTokens,
              latencyMs: accumulatedUsage.latencyMs + stepUsage.latencyMs,
              retries: accumulatedUsage.retries + stepUsage.retries,
              // Preserve the model stamp from whichever iteration first set it.
              model: accumulatedUsage.model ?? stepUsage.model,
            }
          : stepUsage;
      }

      // Shape guard: rejects forbidden user-facing fields before Zod parse.
      const shapeErrors = validateDomainLlmStepOutputShape(rawOutput);

      if (shapeErrors.length > 0) {
        return this.buildFallbackResult(domain, shapeErrors, iteration, toolsInvoked, accumulatedUsage);
      }

      if (!rawOutput || typeof rawOutput !== "object") {
        return this.buildFallbackResult(
          domain,
          ["Domain LLM step output was not an object."],
          iteration,
          toolsInvoked,
          accumulatedUsage,
        );
      }

      const outputKind = (rawOutput as Record<string, unknown>)["kind"];

      if (outputKind === "tool_request") {
        // Per-domain tool allowlist enforcement.
        const toolName = (rawOutput as Record<string, unknown>)["tool"] as AgentToolName | undefined;

        if (!toolName) {
          return this.buildFallbackResult(
            domain,
            ["Domain LLM tool_request missing tool name."],
            iteration,
            toolsInvoked,
            accumulatedUsage,
          );
        }

        // CRITICAL: per-domain isolation — only tools in THIS domain's allowlist are permitted.
        if (!domainEntry.allowedTools.includes(toolName)) {
          return this.buildFallbackResult(
            domain,
            [
              `Domain "${domain}": requested tool "${toolName}" is not in the per-domain allowlist ` +
                `[${domainEntry.allowedTools.join(", ")}].`,
            ],
            iteration,
            toolsInvoked,
            accumulatedUsage,
          );
        }

        // Execute the allowed tool via AgentToolRegistryService (read-only context tools only).
        // Tools: getUserContextSlice, getWeeklyProgressContext, searchExerciseCatalog,
        // searchRecipeCatalog, getActivePlanDetail, getRecentAdherence.
        // getDocumentContext is excluded: always returns empty under the allowDocuments=false floor.
        const toolInput = ((rawOutput as Record<string, unknown>)["input"] as Record<string, unknown> | undefined) ?? {};
        const toolResult = await this.agentToolRegistryService.executeTool(
          orchestratorInput.auth,
          {
            tool: toolName,
            input: toolInput,
          },
        );

        priorToolResults.push(toolResult);

        if (toolResult.ok) {
          toolsInvoked.push(toolName);
        }

        // Append tool results into the local coaching context so the next iteration sees them.
        coachingContext["toolResults"] = [...priorToolResults];

        continue;
      }

      if (outputKind === "domain_answer") {
        // Validate the domain_answer shape via the typed schema.
        const parsed = domainAnswerSchema.safeParse(rawOutput);

        if (!parsed.success) {
          return this.buildFallbackResult(
            domain,
            parsed.error.issues.map((i) => i.message),
            iteration,
            toolsInvoked,
            accumulatedUsage,
          );
        }

        const domainAnswer = parsed.data;

        // Ensure domain discriminator matches the executor's domain.
        // (The superRefine on domainLlmStepOutputSchema already checks
        // workoutCalorieEstimate; here we verify the domain field matches.)
        if (domainAnswer.domain !== domain) {
          return this.buildFallbackResult(
            domain,
            [
              `Domain answer domain field "${domainAnswer.domain}" does not match ` +
                `expected domain "${domain}".`,
            ],
            iteration,
            toolsInvoked,
            accumulatedUsage,
          );
        }

        // Reply safety validation on the summary field (mirrors response-mode-executor ~400-409).
        const replySafetyErrors = validateReplySafety(domainAnswer.summary);

        if (replySafetyErrors.length > 0) {
          return this.buildFallbackResult(domain, replySafetyErrors, iteration, toolsInvoked, accumulatedUsage);
        }

        // Build the deterministic id→candidate map for selection-by-ID (Slice 2).
        // IDs are assigned here in code — the LLM never invents them.
        // Pattern: cand_<domain>_<index> (e.g. "cand_workout_0", "cand_nutrition_1").
        const candidateMap = buildCandidateMap(domain, domainAnswer.candidateProposals);

        return {
          domainAnswer,
          candidateMap,
          degraded: false,
          degradedReasons: [],
          loopIterations: iteration,
          toolsInvoked,
          ...(accumulatedUsage !== undefined ? { usage: accumulatedUsage } : {}),
        };
      }

      // Unknown kind — degrade.
      return this.buildFallbackResult(
        domain,
        [`Domain LLM returned unknown step kind: "${String(outputKind)}".`],
        iteration,
        toolsInvoked,
        accumulatedUsage,
      );
    }

    // Loop exhausted without a domain_answer.
    return this.buildFallbackResult(
      domain,
      [
        `Domain "${domain}" loop exhausted ${DOMAIN_MAX_LOOP_ITERATIONS} iterations without a domain_answer.`,
      ],
      DOMAIN_MAX_LOOP_ITERATIONS,
      toolsInvoked,
      accumulatedUsage,
    );
  }

  // ---------------------------------------------------------------------------
  // Private — attachment context with image bytes and extracted text
  // ---------------------------------------------------------------------------

  /**
   * Build bounded attachment context for a domain step, with:
   *  - imageDataUri populated for eligible image attachments on nutrition/health domains.
   *  - textContent + filename populated for document_file MIME attachments on ALL domains
   *    (including workout), sourced from the pre-extracted attachmentTextMap.
   *
   * Safety floors (never relaxable):
   *  - Only image/* MIME types are loaded for vision; non-image MIMEs skip imageDataUri.
   *  - Only domains that perform multimodal analysis (nutrition, health) get imageDataUri;
   *    the workout domain skips image bytes.
   *  - Images larger than IMAGE_DATA_URI_MAX_BYTES are skipped (text metadata fallback).
   *  - Storage read failures are logged and skipped — the turn degrades gracefully.
   *  - textContent is sourced from the pre-extracted map (never re-read from storage here).
   *  - textContent is NEVER logged (only refId + presence logged).
   *  - allowDocuments=false context-budget floor is enforced upstream; not relaxed here.
   */
  private async buildAttachmentContext(
    attachments: ReadonlyArray<AttachmentTurnContextItem> | undefined,
    domain: RouterDomain,
    attachmentTextMap?: ReadonlyMap<string, AttachmentTextExtractionResult>,
  ): Promise<DomainAttachmentContext | undefined> {
    const baseContext = buildDomainAttachmentContext(attachments, domain);

    if (!baseContext) {
      return undefined;
    }

    // Only nutrition and health domains use multimodal vision content.
    const needsImages = domain === "nutrition" || domain === "health";

    // For each item, populate imageDataUri (vision domains) and textContent/filename (all domains).
    const enrichedItems: DomainAttachmentItem[] = await Promise.all(
      baseContext.items.map(async (item) => {
        let enriched: DomainAttachmentItem = item;

        // Populate textContent + filename for document_file MIMEs on ALL domains.
        // Sourced from the pre-extracted map (never re-read from storage here).
        if (attachmentTextMap && !item.mimeType.startsWith("image/")) {
          const extraction = attachmentTextMap.get(item.attachmentRefId);
          // Hoist the attachments lookup once — used by both the ok and empty/failed branches.
          const originalAttachment = attachments?.find(
            (a) => a.attachmentRefId === item.attachmentRefId,
          );

          if (extraction?.status === "ok" && extraction.text) {
            enriched = {
              ...enriched,
              textContent: extraction.text,
              ...(originalAttachment?.filename ? { filename: originalAttachment.filename } : {}),
            };
          } else if (originalAttachment?.filename) {
            // No text extracted (empty/failed), but still carry filename as metadata.
            enriched = { ...enriched, filename: originalAttachment.filename };
          }
        }

        // Populate imageDataUri for image MIMEs on vision-capable domains only.
        if (!needsImages || !item.mimeType.startsWith("image/")) {
          return enriched;
        }

        // storageRef may be null if content was purged by retention policy.
        if (!item.storageRef) {
          return enriched;
        }

        try {
          const buffer = await this.chatAttachmentsService.readStoredContent(item.storageRef);

          if (buffer.length > IMAGE_DATA_URI_MAX_BYTES) {
            this.logger.warn(
              `Domain "${domain}": attachment "${item.attachmentRefId}" image ` +
              `(${buffer.length} bytes) exceeds size cap (${IMAGE_DATA_URI_MAX_BYTES} bytes); ` +
              `skipping imageDataUri — domain LLM will receive text metadata only.`,
            );
            return enriched;
          }

          const imageDataUri = `data:${item.mimeType};base64,${buffer.toString("base64")}`;

          return { ...enriched, imageDataUri };
        } catch (error) {
          // A storage read failure degrades to text-only; the turn is not blocked.
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Domain "${domain}": failed to read storage ref "${item.storageRef}" for ` +
            `attachment "${item.attachmentRefId}": ${message}. Falling back to text-only context.`,
          );
          return enriched;
        }
      }),
    );

    return { items: enrichedItems };
  }

  // ---------------------------------------------------------------------------
  // Private — timeout + fallback helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns a Promise that resolves to a fallback result after DOMAIN_LLM_TIMEOUT_MS.
   * NEVER rejects — this is intentional so Promise.race cannot propagate a rejection
   * into the orchestrator's Promise.all and crash the turn.
   *
   * When the timeout fires, aborts the AbortController so any in-flight fetch or
   * retry in the loop receives an AbortError and stops immediately.
   */
  private buildTimeoutFallback(
    domain: RouterDomain,
    abortController: AbortController,
  ): Promise<DomainLlmExecutorResult> {
    return new Promise<DomainLlmExecutorResult>((resolve) => {
      setTimeout(() => {
        abortController.abort();
        resolve(
          this.buildFallbackResult(
            domain,
            [`Domain "${domain}" LLM call timed out after ${DOMAIN_LLM_TIMEOUT_MS}ms.`],
            0,
            [],
          ),
        );
      }, DOMAIN_LLM_TIMEOUT_MS);
    });
  }

  /**
   * Build a safe fallback result.
   * The fallback domain_answer always has empty candidateProposals so no
   * unvalidated proposals leak into the turn from a degraded domain.
   *
   * `accumulatedUsage` threads any usage from completed iterations into the
   * fallback result for accurate metering (e.g. when the loop degraded mid-run
   * after one or more successful provider calls).
   */
  private buildFallbackResult(
    domain: RouterDomain,
    reasons: string[],
    loopIterations: number,
    toolsInvoked: AgentToolName[],
    accumulatedUsage?: ProviderUsage,
  ): DomainLlmExecutorResult {
    return {
      domainAnswer: createFallbackDomainAnswer(domain),
      candidateMap: new Map(),
      degraded: true,
      degradedReasons: reasons,
      loopIterations,
      toolsInvoked,
      ...(accumulatedUsage !== undefined ? { usage: accumulatedUsage } : {}),
    };
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * Build a deterministic id→candidate map from a domain answer's candidateProposals.
 *
 * Keys are assigned in code — the LLM never invents them:
 *   `cand_<domain>_<index>` (e.g. "cand_workout_0", "cand_nutrition_1")
 *
 * This is the source of truth for selection-by-ID (Slice 2): the orchestrator
 * merges these maps across domains and passes the union to ActionResolverService
 * for resolving selectedProposalIds → canonical payloads.
 *
 * Empty when candidateProposals is empty (degraded/fallback answers).
 */
export function buildCandidateMap(
  domain: RouterDomain,
  candidateProposals: readonly Record<string, unknown>[],
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();

  for (let i = 0; i < candidateProposals.length; i++) {
    const candidate = candidateProposals[i];

    if (candidate) {
      map.set(`cand_${domain}_${i}`, candidate);
    }
  }

  return map;
}

/**
 * Build bounded attachment context for a domain step request.
 *
 * Attachments are images-only and context-only. All attachments from the turn
 * are passed to every selected domain — the domain LLM decides relevance based
 * on its own prompt and allowlists. No category-based domain filter, no upfront
 * medical consent gate (that gate has been removed per the locked architecture).
 *
 * Safety constraints (still enforced):
 *  - imageDataUri is NOT populated here. The instance method
 *    buildAttachmentContext calls this helper then loads image bytes
 *    from ChatAttachmentsService for nutrition/health domains.
 *    The stub provider path leaves imageDataUri absent (no external calls).
 *  - allowDocuments=false context-budget floor is enforced by CoachingContextService
 *    before this service runs; this function does not relax it.
 *  - Returns undefined (absent field on the request) when no attachments are
 *    present so the Zod schema does not require an empty array.
 */
function buildDomainAttachmentContext(
  attachments: ReadonlyArray<AttachmentTurnContextItem> | undefined,
  _domain: RouterDomain,
): DomainAttachmentContext | undefined {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }

  const items = attachments.map((a) => ({
    attachmentRefId: a.attachmentRefId,
    category: a.category as string,
    mimeType: a.mimeType,
    consentState: a.consentState,
    storageRef: a.storageRef,
    // imageDataUri is populated by buildAttachmentContext after this function returns.
  }));

  return { items };
}
