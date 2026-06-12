import { validateProposalSafety } from "@health/ai";
import type {
  ChatMessage,
  ChatThread,
  ChatTurnResponse,
  CreateChatThreadInput,
  ProgressReporter,
  ProposalValidationFailureClass,
  RawAiProposal,
  SendChatMessageInput,
} from "@health/types";
import {
  classifyProposalValidationFailure,
  deriveQuickActionsForTurn,
  detectPreprocessorLanguage,
  evaluateWellbeingCrisisFromText,
  formatWellbeingCrisisSupportReply,
  getTodayIsoDateInTimezone,
  isWeeklyReviewChatMessage,
  mergeDeterministicChatProposals,
  normalizePreprocessorText,
  resolvePreprocessorResponseLanguage,
  resolveQuotaLimitReply,
  shouldTriggerRecipeRecommendationRequest,
} from "@health/types";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { AiService } from "../ai/ai.service.js";
import type { AttachmentTurnContext } from "../ai/agent-orchestrator.service.js";
import { AiBehaviorConfigService } from "../ai/ai-behavior-config.service.js";
import { ProposalRepairService } from "../ai/proposal-repair.service.js";
import {
  AiMessageQuotaExceededError,
  EntitlementsService,
} from "../billing/entitlements.service.js";
import { ChatAttachmentsService } from "../chat-attachments/chat-attachments.service.js";
import { ChatTurnAttachmentStageService } from "../chat-attachments/chat-turn-attachment-stage.service.js";
import { ProgressWeeklyReviewService } from "../progress/progress-weekly-review.service.js";
import {
  ProposalNormalizationService,
  type ProposalNormalizationContext,
} from "../proposals/proposal-normalization.service.js";
import { ProposalValidationService } from "../proposals/proposal-validation.service.js";
import { RecipesService } from "../recipes/recipes.service.js";
import { UsersService } from "../users/users.service.js";
import { WellbeingCheckInsService } from "../wellbeing-check-ins/wellbeing-check-ins.service.js";
import { toChatMessage, toChatThread } from "./chat.mapper.js";
import { ChatRepository } from "./chat.repository.js";
import { DirectChatPathService } from "./direct-chat-path.service.js";
import { ProposalExplainerService } from "./proposal-explainer.service.js";
import { toAiProposal } from "../proposals/proposal.mapper.js";

const AI_RECENT_MESSAGE_LIMIT = 20;

/**
 * Per-turn self-repair budget. Each repair is a bounded (~10s) sequential LLM
 * call inside the `validating` SSE stage, so a turn with many schema-invalid
 * proposals must not stack repairs; beyond the budget proposals skip repair
 * and persist invalid as normal.
 */
const MAX_PROPOSAL_REPAIR_ATTEMPTS_PER_TURN = 2;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly usersService: UsersService,
    private readonly aiService: AiService,
    private readonly proposalValidationService: ProposalValidationService,
    private readonly proposalNormalizationService: ProposalNormalizationService,
    private readonly proposalRepairService: ProposalRepairService,
    private readonly progressWeeklyReviewService: ProgressWeeklyReviewService,
    private readonly wellbeingCheckInsService: WellbeingCheckInsService,
    private readonly recipesService: RecipesService,
    private readonly chatAttachmentsService: ChatAttachmentsService,
    private readonly chatTurnAttachmentStageService: ChatTurnAttachmentStageService,
    private readonly directChatPathService: DirectChatPathService,
    private readonly proposalExplainerService: ProposalExplainerService,
    private readonly aiBehaviorConfigService: AiBehaviorConfigService,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  async listThreads(auth: ClerkAuthContext): Promise<ChatThread[]> {
    const user = await this.usersService.resolveFromAuth(auth);
    const threads = await this.chatRepository.listThreadsByUserId(user.id);

    return threads.map(toChatThread);
  }

  async createThread(
    auth: ClerkAuthContext,
    input: CreateChatThreadInput,
  ): Promise<ChatThread> {
    const user = await this.usersService.resolveFromAuth(auth);
    const thread = await this.chatRepository.createThread(user.id, input);

    return toChatThread(thread);
  }

  async getThread(
    auth: ClerkAuthContext,
    threadId: string,
  ): Promise<{ thread: ChatThread; messages: ChatMessage[] }> {
    const user = await this.usersService.resolveFromAuth(auth);
    const thread = await this.chatRepository.findThreadById(user.id, threadId);

    if (!thread) {
      throw new NotFoundException("Chat thread not found.");
    }

    const messages = await this.chatRepository.listMessagesByThreadId(threadId);
    const messageIds = messages.map((m) => m.id);
    const attachmentsByMessage = await this.chatAttachmentsService.getMessageDisplayAttachments(
      user.id,
      messageIds,
    );

    return {
      thread: toChatThread(thread),
      messages: messages.map((m) => toChatMessage(m, attachmentsByMessage.get(m.id) ?? [])),
    };
  }

  async sendMessage(
    auth: ClerkAuthContext,
    threadId: string,
    input: SendChatMessageInput,
    onProgress?: ProgressReporter,
  ): Promise<ChatTurnResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const thread = await this.chatRepository.findThreadById(user.id, threadId);

    if (!thread) {
      throw new NotFoundException("Chat thread not found.");
    }

    const existingMessages = await this.chatRepository.listMessagesByThreadId(threadId);
    const attachmentRefIds = input.attachmentRefIds ?? [];
    const todayIsoDate = getTodayIsoDateInTimezone(user.timezone);

    if (attachmentRefIds.length > 0) {
      await this.chatTurnAttachmentStageService.validateRefsForSend(user.id, attachmentRefIds);
    }

    const messageContent =
      input.content.trim().length > 0
        ? input.content
        : this.aiBehaviorConfigService.getChat().emptyAttachmentMessage;

    const userMessage = await this.chatRepository.createMessage(
      threadId,
      "user",
      messageContent,
      attachmentRefIds.length > 0
        ? {
            attachmentRefIds,
          }
        : {},
    );

    const attachmentTurnResult =
      attachmentRefIds.length > 0
        ? await this.chatTurnAttachmentStageService.runTurnStages({
            userId: user.id,
            threadId,
            messageId: userMessage.id,
            attachmentRefIds,
          })
        : null;

    const attachmentMetadata = attachmentTurnResult?.attachmentMetadata ?? [];

    // Build display attachments for the user message after turn stages have linked them.
    // This is a single batched query scoped to this message only.
    const getUserMessageDisplayAttachments = async () => {
      if (attachmentRefIds.length === 0) {
        return [];
      }
      const map = await this.chatAttachmentsService.getMessageDisplayAttachments(user.id, [
        userMessage.id,
      ]);
      return map.get(userMessage.id) ?? [];
    };

    const crisisEvaluation = evaluateWellbeingCrisisFromText(messageContent);

    if (crisisEvaluation.shouldShowCrisisSupport && crisisEvaluation.copy) {
      const assistantMessage = await this.chatRepository.createMessage(
        threadId,
        "assistant",
        formatWellbeingCrisisSupportReply(crisisEvaluation.copy),
        {
          crisisBoundary: true,
          crisisSupport: crisisEvaluation,
        },
      );

      const title =
        thread.title ??
        (existingMessages.length === 0 ? truncateTitle(messageContent) : undefined);

      await this.chatRepository.touchThread(threadId, title);

      const updatedThread = await this.chatRepository.findThreadById(user.id, threadId);

      return {
        thread: toChatThread(updatedThread ?? thread),
        userMessage: toChatMessage(userMessage, await getUserMessageDisplayAttachments()),
        assistantMessage: toChatMessage(assistantMessage),
        proposals: [],
      };
    }

    const explainerPreAi = await this.proposalExplainerService.resolvePreAiTurn({
      auth,
      threadId,
      userMessage: messageContent,
      hasAttachments: attachmentRefIds.length > 0,
      hasProposalRevision: Boolean(input.proposalRevision),
    });

    if (explainerPreAi.kind === "no_proposal") {
      const assistantMessage = await this.chatRepository.createMessage(
        threadId,
        "assistant",
        explainerPreAi.reply,
        {
          proposalExplainer: {
            status: "no_proposal",
          },
        },
      );

      const title =
        thread.title ??
        (existingMessages.length === 0 ? truncateTitle(messageContent) : undefined);

      await this.chatRepository.touchThread(threadId, title);

      const updatedThread = await this.chatRepository.findThreadById(user.id, threadId);

      return {
        thread: toChatThread(updatedThread ?? thread),
        userMessage: toChatMessage(userMessage, await getUserMessageDisplayAttachments()),
        assistantMessage: toChatMessage(assistantMessage),
        proposals: [],
      };
    }

    const directPathResult = await this.directChatPathService.tryExecute({
      auth,
      userMessage: messageContent,
      proposalRevision: input.proposalRevision,
      hasAttachments: attachmentRefIds.length > 0,
    });

    if (directPathResult) {
      const assistantMessage = await this.chatRepository.createMessage(
        threadId,
        "assistant",
        directPathResult.reply,
        {
          directPath: directPathResult.metadata,
        },
      );

      const title =
        thread.title ??
        (existingMessages.length === 0 ? truncateTitle(messageContent) : undefined);

      await this.chatRepository.touchThread(threadId, title);

      const updatedThread = await this.chatRepository.findThreadById(user.id, threadId);

      return {
        thread: toChatThread(updatedThread ?? thread),
        userMessage: toChatMessage(userMessage, await getUserMessageDisplayAttachments()),
        assistantMessage: toChatMessage(assistantMessage),
        proposals: [],
      };
    }

    // Quota gate: enforce free-tier daily AI message limit.
    // Placed after all pre-AI early returns (crisis, proposal-explainer, direct-path)
    // so non-LLM turns do not consume quota.
    try {
      await this.entitlementsService.assertAiMessageAllowed(user.id, todayIsoDate);
    } catch (error) {
      if (error instanceof AiMessageQuotaExceededError) {
        // Deterministic system reply — copy lives in repo config (no-stubs rule),
        // selected by the turn's response language using the same resolution the
        // AI pipeline uses (MessagePreprocessor): persisted locale hint takes
        // precedence, then script detection on the message text.
        const quotaReply = resolveQuotaLimitReply(
          this.aiBehaviorConfigService.getChat(),
          resolvePreprocessorResponseLanguage(
            detectPreprocessorLanguage(normalizePreprocessorText(messageContent)),
            user.locale ?? null,
          ),
        );
        const assistantMessage = await this.chatRepository.createMessage(
          threadId,
          "assistant",
          quotaReply,
          {
            quota: { limitReached: true, tier: "free" },
          },
        );

        const title =
          thread.title ??
          (existingMessages.length === 0 ? truncateTitle(messageContent) : undefined);

        await this.chatRepository.touchThread(threadId, title);

        const updatedThread = await this.chatRepository.findThreadById(user.id, threadId);

        return {
          thread: toChatThread(updatedThread ?? thread),
          userMessage: toChatMessage(userMessage),
          assistantMessage: toChatMessage(assistantMessage),
          proposals: [],
        };
      }

      throw error;
    }

    const isWeeklyReviewTurn = isWeeklyReviewChatMessage(input.content);
    const todayCheckIn = await this.wellbeingCheckInsService.getCheckInForDate(
      auth,
      todayIsoDate,
    );

    // Emit preprocessing stage before the AI pipeline runs.
    // Pre-AI gate turns (crisis, direct-path, quota, no-proposal explainer) return
    // early above without emitting any stage events — that is by design.
    emitStageProgress(onProgress, "preprocessing");

    const generated = await this.aiService.generateCoachResponse({
      auth,
      userMessage: messageContent,
      responseLocale: user.locale,
      recentMessages: existingMessages
        .slice(-AI_RECENT_MESSAGE_LIMIT)
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ...(input.proposalRevision ? { proposalRevision: input.proposalRevision } : {}),
      ...(explainerPreAi.kind === "with_proposal"
        ? { proposalExplainer: explainerPreAi.context }
        : {}),
      ...(attachmentMetadata.length > 0
        ? {
            attachmentTurn: {
              attachments: attachmentMetadata.map((meta) => ({
                attachmentRefId: meta.refId,
                category: meta.category,
                mimeType: meta.mimeType,
                consentState: meta.consentState,
                storageRef: meta.storageRef,
                filename: meta.filename,
              })),
            } satisfies AttachmentTurnContext,
          }
        : {}),
      onProgress,
    });

    // Record AI message usage after a successful LLM response (not on error).
    // Awaited so the per-day counter is consistent before the next request is
    // served (closes the sequential check-then-act quota-bypass window). A
    // bookkeeping failure must not break an already-generated chat response, so
    // the increment error is swallowed rather than surfaced to the user.
    try {
      await this.entitlementsService.recordAiMessageUsage(user.id, todayIsoDate);
    } catch {
      // Usage increment failed — intentionally not surfaced to the user.
    }

    let proposalsToPersist: RawAiProposal[] = generated.output.proposals;
    let weeklyReviewMetadata: Record<string, unknown> | undefined;
    const isProposalExplainerTurn = explainerPreAi.kind === "with_proposal";

    if (isProposalExplainerTurn) {
      proposalsToPersist = [];
    }

    if (isWeeklyReviewTurn) {
      const packed = await this.progressWeeklyReviewService.packChatWeeklyReviewProposals(
        auth,
        generated.output.proposals,
      );

      proposalsToPersist = packed.proposalsToPersist;
      weeklyReviewMetadata = {
        weeklyReview: {
          summaryId: packed.summary.summary.id,
          laneOutcomes: packed.laneOutcomes,
          packMeta: packed.packMeta,
        },
      };
    }

    proposalsToPersist = mergeDeterministicChatProposals({
      userMessage: messageContent,
      todayIsoDate,
      hasTodayWellbeingCheckIn: todayCheckIn.checkIn != null,
      aiProposals: proposalsToPersist,
      triggerConfig: this.aiBehaviorConfigService.getDeterministicProposalTriggers(),
    }) as RawAiProposal[];

    const attachmentOutcomes = attachmentTurnResult?.outcomes ?? [];


    if (
      shouldTriggerRecipeRecommendationRequest(
        messageContent,
        this.aiBehaviorConfigService.getDeterministicProposalTriggers(),
      ) &&
      !proposalsToPersist.some((proposal) => proposal.intent === "recommend_recipes")
    ) {
      const recipeProposal = await this.recipesService.packChatRecipeRecommendationProposal(auth);

      if (recipeProposal) {
        proposalsToPersist.push(recipeProposal as RawAiProposal);
      }
    }

    // Emit validating stage before the proposal safety + domain validation stack.
    // The reply text and proposals are ONLY visible to the user after this stage
    // completes (they're in the `final` SSE event) — this is the safety floor.
    emitStageProgress(onProgress, "validating");

    // Server turn state for trusted normalization stamping — built once per turn,
    // never sourced from LLM output.
    const proposalNormalizationContext: ProposalNormalizationContext = {
      userId: user.id,
      nowIso: new Date().toISOString(),
      turnAttachments: attachmentMetadata.map((meta) => ({
        id: meta.refId,
        mimeType: meta.mimeType,
        category: meta.category,
      })),
    };

    // Normalize + validate (+ self-repair) every proposal BEFORE persisting the
    // assistant message, so repair telemetry can ride on metadata.agent. The
    // assistant reply text is never regenerated by repair.
    const repairStats = { attempted: 0, succeeded: 0 };
    const processedProposals: ProcessedProposal[] = [];

    if (!isProposalExplainerTurn) {
      for (const rawProposal of proposalsToPersist) {
        try {
          processedProposals.push(
            await this.validateAndRepairProposal(
              user.id,
              rawProposal,
              proposalNormalizationContext,
              repairStats,
            ),
          );
        } catch (error) {
          // Fault isolation: a transient failure inside the validation stack
          // (e.g. a DB error in an async ownership check) degrades THIS proposal
          // to an honest invalid result instead of killing the whole paid turn.
          // Privacy floor: intent + error name only — never payloads or raw
          // error messages (DB-driver errors can embed payload values).
          this.logger.warn("proposal_validation.unavailable", {
            intent: rawProposal.intent,
            error: error instanceof Error ? error.name : "unknown",
          });

          processedProposals.push({
            proposal: rawProposal,
            validationStatus: "invalid",
            validationErrors: ["proposal_validation_unavailable"],
          });
        }
      }
    }

    // S2: honest degradation — when turnError is set, persist an error marker instead
    // of fake coach text. The assistant message content is empty (space placeholder
    // that satisfies the DB not-null constraint) and turnError is stored in metadata
    // so the frontend can render an error card instead of coach prose.
    const assistantMessageContent = generated.turnError ? " " : generated.output.reply;

    // Derive suggested quick actions for LLM-backed turns only.
    // Excluded: turnError turns (honest degradation — no coach text to follow up).
    // Selected domains come from the fan-out diagnostics on the agent metadata.
    // Persisted in assistant message metadata so chips survive a thread reload,
    // and mirrored on the turn response for the live path.
    const suggestedQuickActions = generated.turnError
      ? undefined
      : deriveQuickActionsForTurn({
          selectedDomains: (generated.agentMetadata.fanOut?.domains ?? []).map((d) => d.domain),
          quickActionsConfig: this.aiBehaviorConfigService.getSuggestedQuickActions(),
        });
    const assistantMessage = await this.chatRepository.createMessage(
      threadId,
      "assistant",
      assistantMessageContent,
      {
        parseErrors: generated.parseErrors,
        replySafetyErrors: generated.replySafetyErrors,
        // Repair telemetry (counts only) rides on the agent metadata when attempted.
        agent:
          repairStats.attempted > 0
            ? { ...generated.agentMetadata, repair: { ...repairStats } }
            : generated.agentMetadata,
        ...(weeklyReviewMetadata ?? {}),
        // turnError and turnDegraded are a PERMANENT split with disjoint reasons
        // (see packages/types/src/chat-turn.ts):
        //   turnError    = reply ABSENT (decision_failed | reply_blocked); content is " "
        //                  and the frontend renders an error card + retry.
        //   turnDegraded = reply PRESENT but a stage degraded (parse_failed |
        //                  provider_error); quality/telemetry marker only, no card.
        // When turnError is set, turnDegraded is never written.
        ...(generated.turnError
          ? { turnError: generated.turnError }
          : generated.degraded
            ? { turnDegraded: { degraded: true, reason: generated.degraded.reason } }
            : {}),
        ...(suggestedQuickActions && suggestedQuickActions.length > 0
          ? { suggestedQuickActions }
          : {}),
      },
    );

    const createdProposals = [];

    for (const processed of processedProposals) {
      const record = await this.chatRepository.createProposal(
        user.id,
        threadId,
        assistantMessage.id,
        processed.proposal,
        processed.validationStatus,
        processed.validationErrors,
      );

      createdProposals.push(toAiProposal(record));
    }

    const title =
      thread.title ??
      (existingMessages.length === 0 ? truncateTitle(input.content) : undefined);

    await this.chatRepository.touchThread(threadId, title);

    const updatedThread = await this.chatRepository.findThreadById(user.id, threadId);

    return {
      thread: toChatThread(updatedThread ?? thread),
      userMessage: toChatMessage(userMessage, await getUserMessageDisplayAttachments()),
      assistantMessage: toChatMessage(assistantMessage),
      proposals: createdProposals,
      ...(attachmentOutcomes.length > 0 ? { attachmentOutcomes } : {}),
      // COMPATIBILITY CODE (kept intentionally, per refactor-cleanup.md):
      // consentRequired is produced (ActionResolver → decision-maker LLM output) but no
      // client consumes it yet. It is plumbing held for the deferred medical special-save
      // flow (attachment recognition → consent-gated save proposal → accept → persist
      // health_document). Removal condition: remove this flag end-to-end if the
      // special-save flow is descoped, or wire the client consent prompt when it ships.
      ...(generated.consentRequired === true ? { consentRequired: true } : {}),
      // S2: thread the turn-level error to the response so SSE final event and sync
      // response both carry it. The frontend renders an error card instead of coach prose.
      ...(generated.turnError ? { turnError: generated.turnError } : {}),
      ...(suggestedQuickActions && suggestedQuickActions.length > 0
        ? { suggestedQuickActions }
        : {}),
    };
  }

  /**
   * Per-proposal pipeline: normalize → validate → (eligible-invalid only)
   * self-repair → re-normalize + re-run the FULL validation stack → final result.
   *
   * Repair eligibility uses `classifyProposalValidationFailure`: only
   * schema/domain-class failures are repaired — NEVER safety-class (the LLM must
   * not be asked to write around safety floors) and NEVER ownership-class
   * (server-side facts the LLM cannot fix). A failed/still-invalid repair keeps
   * the honest invalid card exactly as before.
   *
   * `repairStats` is mutated so the caller can attach `{ attempted, succeeded }`
   * turn telemetry to the assistant-message agent metadata. It also enforces the
   * per-turn repair budget (`MAX_PROPOSAL_REPAIR_ATTEMPTS_PER_TURN`): proposals
   * beyond the budget skip repair and persist invalid as normal.
   */
  private async validateAndRepairProposal(
    userId: string,
    rawProposal: RawAiProposal,
    normalizationContext: ProposalNormalizationContext,
    repairStats: { attempted: number; succeeded: number },
  ): Promise<ProcessedProposal> {
    let proposal = await this.normalizeProposalChanges(rawProposal, normalizationContext);
    let stack = await this.runProposalValidationStack(userId, proposal);

    if (stack.validationErrors.length === 0) {
      return { proposal, validationStatus: "valid", validationErrors: [] };
    }

    let failureClass: ProposalValidationFailureClass = classifyProposalValidationFailure({
      safetyErrors: stack.safetyErrors,
      schemaErrors: stack.schemaErrors,
      ownershipErrors: stack.ownershipErrors,
    });

    if (failureClass === "schema" && this.proposalRepairService.isAvailable) {
      if (repairStats.attempted >= MAX_PROPOSAL_REPAIR_ATTEMPTS_PER_TURN) {
        // Budget exhausted: skip repair, persist invalid as normal.
        // Privacy floor: intent + failure class only — never payloads.
        this.logger.warn("proposal_repair.budget_exhausted", {
          intent: proposal.intent,
          failureClass,
        });
      } else {
        repairStats.attempted += 1;
        // Privacy floor: intent + failure class + error count only — never payloads.
        this.logger.log("proposal_repair.attempted", {
          intent: proposal.intent,
          failureClass,
          errorCount: stack.validationErrors.length,
        });

        const repaired = await this.proposalRepairService.tryRepair(
          proposal,
          stack.validationErrors,
        );

        if (repaired) {
          // The repaired payload goes back through the SAME normalize + full
          // validation stack — repair never bypasses any check.
          const renormalized = await this.normalizeProposalChanges(repaired, normalizationContext);
          const repairedStack = await this.runProposalValidationStack(userId, renormalized);

          if (repairedStack.validationErrors.length === 0) {
            repairStats.succeeded += 1;
            this.logger.log("proposal_repair.succeeded", {
              intent: renormalized.intent,
              failureClass,
              errorCount: 0,
            });

            return { proposal: renormalized, validationStatus: "valid", validationErrors: [] };
          }

          // Still invalid: persist the repaired payload with its FINAL errors.
          proposal = renormalized;
          stack = repairedStack;
          failureClass = classifyProposalValidationFailure({
            safetyErrors: stack.safetyErrors,
            schemaErrors: stack.schemaErrors,
            ownershipErrors: stack.ownershipErrors,
          });
        }

        this.logger.warn("proposal_repair.still_invalid", {
          intent: proposal.intent,
          failureClass,
          errorCount: stack.validationErrors.length,
        });
      }
    }

    this.logger.warn("Proposal validation failed", {
      intent: proposal.intent,
      targetDomain: proposal.targetDomain,
      failureClass,
      errorCount: stack.validationErrors.length,
    });

    return {
      proposal,
      validationStatus: "invalid",
      validationErrors: stack.validationErrors,
    };
  }

  /**
   * Bridge known LLM shape variance to the canonical payload form before the
   * schema + domain validation stack runs. Must happen before validateRawProposal.
   */
  private async normalizeProposalChanges(
    rawProposal: RawAiProposal,
    normalizationContext: ProposalNormalizationContext,
  ): Promise<RawAiProposal> {
    const normalizedChanges = await this.proposalNormalizationService.normalizeProposal(
      rawProposal.intent,
      rawProposal.proposedChanges,
      normalizationContext,
    );

    if (normalizedChanges === rawProposal.proposedChanges) {
      return rawProposal;
    }

    // Cast is safe: normalizers only reshape intent-owned payload fields and
    // preserve everything else; the full validation stack re-parses afterwards.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { ...rawProposal, proposedChanges: normalizedChanges } as any as RawAiProposal;
  }

  /**
   * The full proposal validation stack — exactly the same checks in the same
   * order as before extraction. Returns the three classification buckets
   * (safety / schema / ownership-context) plus the combined error list, so the
   * caller can classify failures and decide repair eligibility.
   */
  private async runProposalValidationStack(
    userId: string,
    rawProposal: RawAiProposal,
  ): Promise<ProposalValidationStackResult> {
    const safetyErrors = validateProposalSafety(rawProposal);
    const validation = this.proposalValidationService.validateRawProposal(rawProposal);
    const ownershipErrors =
      await this.proposalValidationService.validateCorrelationEvidenceOwnership(
        userId,
        rawProposal.evidenceRefs,
      );
    const provenanceErrors =
      await this.proposalValidationService.validateProvenanceOwnership(
        userId,
        rawProposal.intent,
        rawProposal.proposedChanges,
      );
    const progressLinkedProvenanceErrors =
      this.proposalValidationService.validateProgressLinkedProvenanceRequired(
        rawProposal.intent,
        rawProposal.proposedChanges,
      );
    const goalHierarchyErrors =
      await this.proposalValidationService.validateGoalProposalHierarchy(
        userId,
        rawProposal.intent,
        rawProposal.proposedChanges,
      );
    const todaySourceRefErrors =
      await this.proposalValidationService.validateTodayChecklistGoalSourceRefs(
        userId,
        rawProposal.intent,
        rawProposal.proposedChanges,
      );
    const recoveryAdaptationErrors =
      await this.proposalValidationService.validateRecoveryAwareWorkoutAdaptation(
        userId,
        rawProposal.intent,
        rawProposal.proposedChanges,
      );
    const habitProposalContextErrors =
      await this.proposalValidationService.validateHabitProposalContext(
        userId,
        rawProposal.intent,
        rawProposal.proposedChanges,
      );
    const wellbeingProposalContextErrors =
      await this.proposalValidationService.validateWellbeingCheckinProposalContext(
        userId,
        rawProposal.intent,
        rawProposal.proposedChanges,
      );
    const nutritionIncidentImageRefErrors =
      await this.proposalValidationService.validateNutritionIncidentImageRefOwnership(
        userId,
        rawProposal.intent,
        rawProposal.proposedChanges,
      );
    const recipeRecommendationContextErrors =
      await this.proposalValidationService.validateRecipeRecommendationProposalContext(
        userId,
        rawProposal.intent,
        rawProposal.proposedChanges,
      );
    const chatAttachmentProposalRefErrors =
      await this.proposalValidationService.validateChatAttachmentProposalRefs(
        userId,
        rawProposal.intent,
        rawProposal.proposedChanges,
      );

    // All non-safety, non-schema errors from domain checks are ownership/context errors.
    const combinedOwnershipErrors: string[] = [
      ...ownershipErrors,
      ...provenanceErrors,
      ...progressLinkedProvenanceErrors,
      ...goalHierarchyErrors,
      ...todaySourceRefErrors,
      ...recoveryAdaptationErrors,
      ...habitProposalContextErrors,
      ...wellbeingProposalContextErrors,
      ...nutritionIncidentImageRefErrors,
      ...recipeRecommendationContextErrors,
      ...chatAttachmentProposalRefErrors,
    ];

    return {
      safetyErrors,
      schemaErrors: validation.errors,
      ownershipErrors: combinedOwnershipErrors,
      validationErrors: [...safetyErrors, ...validation.errors, ...combinedOwnershipErrors],
    };
  }
}

/** Final per-proposal result, ready for persistence next to the assistant message. */
interface ProcessedProposal {
  proposal: RawAiProposal;
  validationStatus: "valid" | "invalid";
  validationErrors: string[];
}

/** Bucketed output of the validation stack (buckets feed failure classification). */
interface ProposalValidationStackResult {
  safetyErrors: string[];
  schemaErrors: string[];
  ownershipErrors: string[];
  /** safety + schema + ownership, in the exact pre-extraction order. */
  validationErrors: string[];
}

function truncateTitle(content: string): string {
  const trimmed = content.trim();

  return trimmed.length <= 80 ? trimmed : `${trimmed.slice(0, 77)}...`;
}

/**
 * Safely emit a coarse stage progress event.
 *
 * Failures are swallowed — a throwing callback must never break the turn.
 * Privacy: stage events carry no user content, reply text, proposal payloads,
 * or health data — only the stage name.
 */
function emitStageProgress(
  onProgress: ProgressReporter | undefined,
  stage: import("@health/types").ChatTurnStreamStage,
): void {
  if (!onProgress) {
    return;
  }

  try {
    onProgress({ kind: "stage", stage });
  } catch {
    // Swallow — progress reporting must never affect turn correctness.
  }
}
