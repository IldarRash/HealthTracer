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
  isWeeklyReviewChatMessage,
} from "@health/types";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { AiService } from "../ai/ai.service.js";
import { ProgressWeeklyReviewService } from "../progress/progress-weekly-review.service.js";
import { ProposalValidationService } from "../proposals/proposal-validation.service.js";
import { UsersService } from "../users/users.service.js";
import { toChatMessage, toChatThread } from "./chat.mapper.js";
import { ChatRepository } from "./chat.repository.js";
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
    const userMessage = await this.chatRepository.createMessage(
      threadId,
      "user",
      input.content,
    );

    const crisisEvaluation = evaluateWellbeingCrisisFromText(input.content);

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
        (existingMessages.length === 0 ? truncateTitle(input.content) : undefined);

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

    const generated = await this.aiService.generateCoachResponse({
      auth,
      userMessage: input.content,
      recentMessages: [...existingMessages, userMessage]
        .slice(-AI_RECENT_MESSAGE_LIMIT)
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
    });

    let proposalsToPersist: RawAiProposal[] = generated.output.proposals;
    let weeklyReviewMetadata: Record<string, unknown> | undefined;

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

    const assistantMessage = await this.chatRepository.createMessage(
      threadId,
      "assistant",
      generated.output.reply,
      {
        parseErrors: generated.parseErrors,
        replySafetyErrors: generated.replySafetyErrors,
        ...(weeklyReviewMetadata ?? {}),
      },
    );

    const createdProposals = [];

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
    };
  }
}

function truncateTitle(content: string): string {
  const trimmed = content.trim();

  return trimmed.length <= 80 ? trimmed : `${trimmed.slice(0, 77)}...`;
}
