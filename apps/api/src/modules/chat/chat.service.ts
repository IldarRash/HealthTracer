import { validateProposalSafety } from "@health/ai";
import type {
  ChatAttachmentOutcome,
  ChatMessage,
  ChatThread,
  ChatTurnResponse,
  CreateChatThreadInput,
  RawAiProposal,
  SendChatMessageInput,
  WorkoutAttachmentRecognitionEnvelope,
} from "@health/types";
import {
  evaluateWellbeingCrisisFromText,
  formatWellbeingCrisisSupportReply,
  getChatAttachmentOwnershipErrors,
  getChatAttachmentSendEligibilityErrors,
  getTodayIsoDateInTimezone,
  inferMealContextFromMessage,
  isWeeklyReviewChatMessage,
  mergeDeterministicChatProposals,
  shouldTriggerRecipeRecommendationRequest,
} from "@health/types";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { AiService } from "../ai/ai.service.js";
import type { AttachmentTurnContext } from "../ai/agent-orchestrator.service.js";
import { AiBehaviorConfigService } from "../ai/ai-behavior-config.service.js";
import { ChatAttachmentRecognitionService } from "../chat-attachments/chat-attachment-recognition.service.js";
import { ChatAttachmentsService } from "../chat-attachments/chat-attachments.service.js";
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
    private readonly chatAttachmentRecognitionService: ChatAttachmentRecognitionService,
    private readonly directChatPathService: DirectChatPathService,
    private readonly proposalExplainerService: ProposalExplainerService,
    private readonly aiBehaviorConfigService: AiBehaviorConfigService,
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

    return {
      thread: toChatThread(thread),
      messages: messages.map(toChatMessage),
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
    let attachmentRecords: Awaited<
      ReturnType<ChatAttachmentsService["assertOwnedAttachmentRefs"]>
    > = [];

    if (attachmentRefIds.length > 0) {
      attachmentRecords = await this.chatAttachmentsService.assertOwnedAttachmentRefs(
        user.id,
        attachmentRefIds,
      );
      const ownedAttachments = attachmentRecords.map((attachment) => ({
        id: attachment.id,
        userId: attachment.userId,
        category: attachment.category,
        status: attachment.status,
        linkedDocumentId: attachment.linkedDocumentId,
        linkedImageRefId: attachment.linkedImageRefId,
        retentionPolicy: attachment.retentionPolicy,
        expiresAt: attachment.expiresAt,
      }));

      const attachmentRefValidationErrors = [
        ...getChatAttachmentOwnershipErrors(attachmentRefIds, ownedAttachments),
        ...getChatAttachmentSendEligibilityErrors(attachmentRefIds, ownedAttachments),
      ];

      if (attachmentRefValidationErrors.length > 0) {
        throw new BadRequestException({
          message: "Attachment references failed validation.",
          validationErrors: attachmentRefValidationErrors,
        });
      }
    }

    const messageContent =
      input.content.trim().length > 0 ? input.content : "Shared attachment(s) for coaching review.";

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

    if (attachmentRefIds.length > 0) {
      await this.chatAttachmentsService.linkAttachmentsToMessage(
        user.id,
        attachmentRefIds,
        userMessage.id,
        threadId,
      );

      attachmentRecords =
        await this.chatAttachmentsService.classifyAndRecognizeAttachmentsForMessage({
          auth,
          userId: user.id,
          messageContent,
          attachments: attachmentRecords,
        });
    }

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
        userMessage: toChatMessage(userMessage),
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
        userMessage: toChatMessage(userMessage),
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
        userMessage: toChatMessage(userMessage),
        assistantMessage: toChatMessage(assistantMessage),
        proposals: [],
      };
    }

    const isWeeklyReviewTurn = isWeeklyReviewChatMessage(input.content);
    const todayIsoDate = getTodayIsoDateInTimezone(user.timezone);
    const todayCheckIn = await this.wellbeingCheckInsService.getCheckInForDate(
      auth,
      todayIsoDate,
    );

    const mealContextLabel = inferMealContextFromMessage(messageContent);
    const attachmentProposalCandidatesPreAi = [];

    for (const attachment of attachmentRecords) {
      attachmentProposalCandidatesPreAi.push(
        ...this.chatAttachmentRecognitionService.buildProposalCandidates({
          attachment,
          incidentDateTime: new Date().toISOString(),
          mealContextLabel,
          boundedMessage: messageContent,
          todayIsoDate,
        }),
      );
    }

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
      ...(attachmentRecords.length > 0
        ? {
            attachmentTurn: {
              attachments: attachmentRecords.map((attachment) => ({
                attachmentRefId: attachment.id,
                category: attachment.category,
                status: attachment.status,
                recognition: attachment.recognition,
              })),
              ...(attachmentProposalCandidatesPreAi.length > 0
                ? {
                    preparedProposals: attachmentProposalCandidatesPreAi.map((candidate) => ({
                      intent: candidate.intent,
                      targetDomain: candidate.targetDomain,
                      title: candidate.title,
                    })),
                  }
                : {}),
            } satisfies AttachmentTurnContext,
          }
        : {}),
    });

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

    const attachmentOutcomes: ChatAttachmentOutcome[] = [];
    const attachmentProposalCandidates = [...attachmentProposalCandidatesPreAi];

    for (const attachment of attachmentRecords) {
      const candidates = attachmentProposalCandidates.filter(
        (candidate) => candidate.attachmentRefId === attachment.id,
      );
      attachmentOutcomes.push({
        attachmentRefId: attachment.id,
        category: attachment.category,
        status: attachment.status,
        recognition: attachment.recognition,
        proposalCandidateCount: candidates.length,
      });
    }

    proposalsToPersist = this.chatAttachmentRecognitionService.mergeAttachmentProposals(
      proposalsToPersist,
      attachmentProposalCandidates,
      {
        workoutRecognitions: attachmentRecords
          .map((attachment) => attachment.recognition)
          .filter(
            (recognition): recognition is WorkoutAttachmentRecognitionEnvelope =>
              recognition?.category === "workout_attachment",
          ),
      },
    );

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
      userMessage: toChatMessage(userMessage),
      assistantMessage: toChatMessage(assistantMessage),
      proposals: createdProposals,
      ...(attachmentOutcomes.length > 0 ? { attachmentOutcomes } : {}),
    };
  }
}

function truncateTitle(content: string): string {
  const trimmed = content.trim();

  return trimmed.length <= 80 ? trimmed : `${trimmed.slice(0, 77)}...`;
}
