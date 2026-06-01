/**
 * DomainLlmExecutorService
 *
 * Runs ONE domain LLM bounded loop. The orchestrator invokes the selected
 * domain executors concurrently (Promise.all). This service is split out of
 * ResponseModeExecutorService as part of Phase 4 of the parallel fan-out
 * architecture.
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

import { validateReplySafety, type CoachAiProvider } from "@health/ai";
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
}

export interface DomainLlmExecutorResult {
  /** Final domain answer, either from the LLM or a safe fallback. */
  domainAnswer: DomainAnswer;
  /**
   * True when the result is a safe fallback produced by degradation (timeout,
   * loop exhaustion, safety block, provider error). Callers (orchestrator) use
   * this to record degraded-domain metadata.
   */
  degraded: boolean;
  /** Reason(s) for degradation when degraded=true. */
  degradedReasons: string[];
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
   */
  async runDomainLoop(input: DomainLlmExecutorInput): Promise<DomainLlmExecutorResult> {
    const { domainEntry } = input;
    const domain = domainEntry.domain;

    // Wrap the bounded loop in Promise.race with a per-domain timeout.
    // The timeout NEVER rejects — it resolves to a fallback so the outer
    // Promise.all in the orchestrator is not poisoned by a slow domain.
    const loopPromise = this.executeDomainLoopSafe(input);
    const timeoutPromise = this.buildTimeoutFallback(domain);

    return Promise.race([loopPromise, timeoutPromise]);
  }

  // ---------------------------------------------------------------------------
  // Private — loop execution
  // ---------------------------------------------------------------------------

  /**
   * Safe wrapper around the bounded domain loop.
   * Catches all thrown errors and degrades to a fallback.
   * Never rejects.
   */
  private async executeDomainLoopSafe(
    input: DomainLlmExecutorInput,
  ): Promise<DomainLlmExecutorResult> {
    try {
      return await this.executeDomainLoop(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown domain executor error.";
      return this.buildFallbackResult(input.domainEntry.domain, [message], 0, []);
    }
  }

  /**
   * Core bounded domain loop — may throw; callers wrap with executeDomainLoopSafe.
   */
  private async executeDomainLoop(
    input: DomainLlmExecutorInput,
  ): Promise<DomainLlmExecutorResult> {
    const { domainEntry, contextPacket, orchestratorInput, provider } = input;
    const domain = domainEntry.domain;

    const toolsInvoked: AgentToolName[] = [];
    const priorToolResults: AgentToolCallResult[] = [];

    // Build a mutable local copy of coaching context so we can append tool results
    // per iteration without mutating the shared input reference.
    const coachingContext: Record<string, unknown> = { ...input.coachingContext };

    // Build bounded attachment context for this domain step.
    // Safety: medical_document items are only included when consentState === "granted".
    // imageDataUri is populated below via readImageDataUris for nutrition/health domains
    // with image-MIME attachments and a non-null storageRef.
    const attachmentContext = await this.buildAttachmentContextWithImages(
      orchestratorInput.attachmentTurn?.attachments,
      domain,
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
    };

    for (let iteration = 1; iteration <= DOMAIN_MAX_LOOP_ITERATIONS; iteration += 1) {
      // Assemble the fully-typed step request and validate it before calling provider.
      const stepRequest = domainLlmStepRequestSchema.parse({
        ...baseRequest,
        iteration,
        priorToolResults: [...priorToolResults],
      });

      const rawOutput = await provider.generateDomainStep(stepRequest);

      // Shape guard: rejects forbidden user-facing fields before Zod parse.
      const shapeErrors = validateDomainLlmStepOutputShape(rawOutput);

      if (shapeErrors.length > 0) {
        return this.buildFallbackResult(domain, shapeErrors, iteration, toolsInvoked);
      }

      if (!rawOutput || typeof rawOutput !== "object") {
        return this.buildFallbackResult(
          domain,
          ["Domain LLM step output was not an object."],
          iteration,
          toolsInvoked,
        );
      }

      const outputKind = (rawOutput as Record<string, unknown>)["kind"];

      if (outputKind === "tool_request") {
        // Per-domain tool allowlist enforcement: reuse the pattern from
        // ResponseModeExecutorService.executeToolIteration lines 345-355.
        const toolName = (rawOutput as Record<string, unknown>)["tool"] as AgentToolName | undefined;

        if (!toolName) {
          return this.buildFallbackResult(
            domain,
            ["Domain LLM tool_request missing tool name."],
            iteration,
            toolsInvoked,
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
          );
        }

        // Execute the allowed tool via AgentToolRegistryService (read-only context tools only).
        // Pass the per-domain context budget so getDocumentContext re-applies the
        // deny-by-default document floor (the budget is the code-level safety floor).
        const toolInput = ((rawOutput as Record<string, unknown>)["input"] as Record<string, unknown> | undefined) ?? {};
        const toolResult = await this.agentToolRegistryService.executeTool(
          orchestratorInput.auth,
          {
            tool: toolName,
            input: toolInput,
          },
          domainEntry.contextBudget,
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
          );
        }

        // Reply safety validation on the summary field (mirrors response-mode-executor ~400-409).
        const replySafetyErrors = validateReplySafety(domainAnswer.summary);

        if (replySafetyErrors.length > 0) {
          return this.buildFallbackResult(domain, replySafetyErrors, iteration, toolsInvoked);
        }

        return {
          domainAnswer,
          degraded: false,
          degradedReasons: [],
          loopIterations: iteration,
          toolsInvoked,
        };
      }

      // Unknown kind — degrade.
      return this.buildFallbackResult(
        domain,
        [`Domain LLM returned unknown step kind: "${String(outputKind)}".`],
        iteration,
        toolsInvoked,
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
    );
  }

  // ---------------------------------------------------------------------------
  // Private — attachment context with image bytes
  // ---------------------------------------------------------------------------

  /**
   * Build bounded attachment context for a domain step, with imageDataUri
   * populated for eligible image attachments on the nutrition and health domains.
   *
   * Safety floors (never relaxable):
   *  - medical_document items are excluded unless consentState === "granted".
   *  - Only image/* MIME types are loaded; non-image MIMEs are skipped.
   *  - Only domains that perform multimodal analysis (nutrition, health) get
   *    imageDataUri populated; the workout domain does not need vision content.
   *  - Images larger than IMAGE_DATA_URI_MAX_BYTES are skipped to stay within
   *    the OpenAI vision per-request size limit.
   *  - Storage read failures are logged and skipped — the turn degrades to
   *    text-only metadata rather than blocking the entire domain loop.
   */
  private async buildAttachmentContextWithImages(
    attachments: ReadonlyArray<AttachmentTurnContextItem> | undefined,
    domain: RouterDomain,
  ): Promise<DomainAttachmentContext | undefined> {
    const baseContext = buildDomainAttachmentContext(attachments, domain);

    if (!baseContext) {
      return undefined;
    }

    // Only nutrition and health domains use multimodal vision content.
    const needsImages = domain === "nutrition" || domain === "health";

    if (!needsImages) {
      return baseContext;
    }

    // For each item in the context, attempt to load imageDataUri from storage.
    const itemsWithImages: DomainAttachmentItem[] = await Promise.all(
      baseContext.items.map(async (item) => {
        // Only image/* MIMEs are supported by the OpenAI vision endpoint.
        if (!item.mimeType.startsWith("image/")) {
          return item;
        }

        // storageRef is null when content was purged (no consent for medical).
        if (!item.storageRef) {
          return item;
        }

        try {
          const buffer = await this.chatAttachmentsService.readStoredContent(item.storageRef);

          if (buffer.length > IMAGE_DATA_URI_MAX_BYTES) {
            this.logger.warn(
              `Domain "${domain}": attachment "${item.attachmentRefId}" image ` +
              `(${buffer.length} bytes) exceeds size cap (${IMAGE_DATA_URI_MAX_BYTES} bytes); ` +
              `skipping imageDataUri — domain LLM will receive text metadata only.`,
            );
            return item;
          }

          const imageDataUri = `data:${item.mimeType};base64,${buffer.toString("base64")}`;

          return { ...item, imageDataUri };
        } catch (error) {
          // A storage read failure degrades to text-only; the turn is not blocked.
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Domain "${domain}": failed to read storage ref "${item.storageRef}" for ` +
            `attachment "${item.attachmentRefId}": ${message}. Falling back to text-only context.`,
          );
          return item;
        }
      }),
    );

    return { items: itemsWithImages };
  }

  // ---------------------------------------------------------------------------
  // Private — timeout + fallback helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns a Promise that resolves to a fallback result after DOMAIN_LLM_TIMEOUT_MS.
   * NEVER rejects — this is intentional so Promise.race cannot propagate a rejection
   * into the orchestrator's Promise.all and crash the turn.
   */
  private buildTimeoutFallback(domain: RouterDomain): Promise<DomainLlmExecutorResult> {
    return new Promise<DomainLlmExecutorResult>((resolve) => {
      setTimeout(() => {
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
   */
  private buildFallbackResult(
    domain: RouterDomain,
    reasons: string[],
    loopIterations: number,
    toolsInvoked: AgentToolName[],
  ): DomainLlmExecutorResult {
    return {
      domainAnswer: createFallbackDomainAnswer(domain),
      degraded: true,
      degradedReasons: reasons,
      loopIterations,
      toolsInvoked,
    };
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * Build bounded attachment context for a domain step request.
 *
 * Safety constraints (enforced here, not relaxable by callers):
 *  - medical_document items with consentState !== "granted" are excluded.
 *    A medical attachment without consent is purged/blocked by
 *    apply_upload_disposition; this is a defense-in-depth check so a
 *    non-purged medical attachment cannot reach the LLM without consent.
 *  - imageDataUri is NOT populated here. The instance method
 *    buildAttachmentContextWithImages calls this helper then loads image bytes
 *    from ChatAttachmentsService for nutrition/health domains.
 *    The stub provider path leaves imageDataUri absent (no external calls).
 *  - Returns undefined (absent field on the request) when no relevant
 *    attachments are present for this domain so the Zod schema does not
 *    require an empty array.
 *
 * Domain filtering:
 *  - nutrition: receives food_photo and unclassified image attachments.
 *  - health: receives medical_document (consent-gated) and workout_attachment.
 *  - workout: receives workout_attachment.
 *  - All domains receive all attachments as bounded metadata — the domain LLM
 *    only acts on what its prompt and allowlists permit.
 */
function buildDomainAttachmentContext(
  attachments: ReadonlyArray<AttachmentTurnContextItem> | undefined,
  domain: RouterDomain,
): DomainAttachmentContext | undefined {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }

  // Filter attachments relevant to this domain, enforcing consent gate for medical.
  const items = attachments
    .filter((a) => {
      // Hard safety floor: exclude medical_document unless consent is explicitly granted.
      if (a.category === "medical_document" && a.consentState !== "granted") {
        return false;
      }

      // Domain-to-category relevance filter:
      // - nutrition: food_photo, unclassified (may be food), general images
      // - health: medical_document (consent-gated above), workout_attachment for context
      // - workout: workout_attachment, unclassified
      // - All domains see their relevant types; irrelevant types are excluded to
      //   keep the per-domain context bounded.
      if (domain === "nutrition") {
        return a.category === "food_photo" || a.category === "unclassified";
      }

      if (domain === "health") {
        return a.category === "medical_document" || a.category === "workout_attachment";
      }

      if (domain === "workout") {
        return a.category === "workout_attachment" || a.category === "unclassified";
      }

      // Default: include all for unknown domains (fallback; should not happen).
      return true;
    })
    .map((a) => ({
      attachmentRefId: a.attachmentRefId,
      category: a.category as string,
      mimeType: a.mimeType,
      consentState: a.consentState,
      storageRef: a.storageRef,
      // imageDataUri is populated by buildAttachmentContextWithImages after this function returns.
    }));

  if (items.length === 0) {
    return undefined;
  }

  return { items };
}
