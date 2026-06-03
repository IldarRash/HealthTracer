import { validateProposalSafety } from "@health/ai";
import type {
  ChatMessage,
  ChatThread,
  ChatTurnResponse,
  CreateChatThreadInput,
  RawAiProposal,
  SendChatMessageInput,
} from "@health/types";
import {
  evaluateWellbeingCrisisFromText,
  formatWellbeingCrisisSupportReply,
  getTodayIsoDateInTimezone,
  isWeeklyReviewChatMessage,
  mergeDeterministicChatProposals,
  shouldTriggerRecipeRecommendationRequest,
} from "@health/types";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { AiService } from "../ai/ai.service.js";
import type { AttachmentTurnContext } from "../ai/agent-orchestrator.service.js";
import { AiBehaviorConfigService } from "../ai/ai-behavior-config.service.js";
import {
  AiMessageQuotaExceededError,
  EntitlementsService,
} from "../billing/entitlements.service.js";
import { ChatAttachmentsService } from "../chat-attachments/chat-attachments.service.js";
import { ChatTurnAttachmentStageService } from "../chat-attachments/chat-turn-attachment-stage.service.js";
import { ProgressWeeklyReviewService } from "../progress/progress-weekly-review.service.js";
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

@Injectable()
export class ChatService {
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly usersService: UsersService,
    private readonly aiService: AiService,
    private readonly proposalValidationService: ProposalValidationService,
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
        const quotaReply =
          "You've reached today's free AI message limit — upgrade to Pro for unlimited coaching.";
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

    const generated = await this.aiService.generateCoachResponse({
      auth,
      userMessage: messageContent,
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
              })),
            } satisfies AttachmentTurnContext,
          }
        : {}),
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

    const assistantMessage = await this.chatRepository.createMessage(
      threadId,
      "assistant",
      generated.output.reply,
      {
        parseErrors: generated.parseErrors,
        replySafetyErrors: generated.replySafetyErrors,
        agent: generated.agentMetadata,
        ...(weeklyReviewMetadata ?? {}),
      },
    );

    const createdProposals = [];

    if (!isProposalExplainerTurn) {
      for (const rawProposal of proposalsToPersist) {
        const safetyErrors = validateProposalSafety(rawProposal);
        const validation = this.proposalValidationService.validateRawProposal(rawProposal);
        const ownershipErrors =
          await this.proposalValidationService.validateCorrelationEvidenceOwnership(
            user.id,
            rawProposal.evidenceRefs,
          );
        const provenanceErrors =
          await this.proposalValidationService.validateProvenanceOwnership(
            user.id,
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
            user.id,
            rawProposal.intent,
            rawProposal.proposedChanges,
          );
        const todaySourceRefErrors =
          await this.proposalValidationService.validateTodayChecklistGoalSourceRefs(
            user.id,
            rawProposal.intent,
            rawProposal.proposedChanges,
          );
        const recoveryAdaptationErrors =
          await this.proposalValidationService.validateRecoveryAwareWorkoutAdaptation(
            user.id,
            rawProposal.intent,
            rawProposal.proposedChanges,
          );
        const habitProposalContextErrors =
          await this.proposalValidationService.validateHabitProposalContext(
            user.id,
            rawProposal.intent,
            rawProposal.proposedChanges,
          );
        const wellbeingProposalContextErrors =
          await this.proposalValidationService.validateWellbeingCheckinProposalContext(
            user.id,
            rawProposal.intent,
            rawProposal.proposedChanges,
          );
        const nutritionIncidentImageRefErrors =
          await this.proposalValidationService.validateNutritionIncidentImageRefOwnership(
            user.id,
            rawProposal.intent,
            rawProposal.proposedChanges,
          );
        const recipeRecommendationContextErrors =
          await this.proposalValidationService.validateRecipeRecommendationProposalContext(
            user.id,
            rawProposal.intent,
            rawProposal.proposedChanges,
          );
        const chatAttachmentProposalRefErrors =
          await this.proposalValidationService.validateChatAttachmentProposalRefs(
            user.id,
            rawProposal.intent,
            rawProposal.proposedChanges,
          );
        const validationErrors = [
          ...safetyErrors,
          ...validation.errors,
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
        const validationStatus = validationErrors.length === 0 ? "valid" : "invalid";

        const record = await this.chatRepository.createProposal(
          user.id,
          threadId,
          assistantMessage.id,
          rawProposal,
          validationStatus,
          validationErrors,
        );

        createdProposals.push(toAiProposal(record));
      }
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
      // consentRequired is produced (from ActionResolver → LLM output) but not currently
      // consumed by any client gate. It is surfaced here for the deferred medical special-save
      // flow (proposal-driven recognition → consent-gated proposal → accept → persist
      // health_document). Do not remove — add enforcement when that flow is implemented.
      ...(generated.consentRequired === true ? { consentRequired: true } : {}),
    };
  }
}

function truncateTitle(content: string): string {
  const trimmed = content.trim();

  return trimmed.length <= 80 ? trimmed : `${trimmed.slice(0, 77)}...`;
}
