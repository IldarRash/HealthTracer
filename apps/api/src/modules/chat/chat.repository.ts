import { aiProposals, chatMessages, chatThreads } from "@health/db";
import type {
  CreateChatThreadInput,
  ProposalIntent,
  ProposalStatus,
  ProposalTargetDomain,
  ProposalValidationStatus,
  RawAiProposal,
} from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

@Injectable()
export class ChatRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async listThreadsByUserId(userId: string) {
    return this.db
      .select()
      .from(chatThreads)
      .where(eq(chatThreads.userId, userId))
      .orderBy(desc(chatThreads.updatedAt));
  }

  async findThreadById(userId: string, threadId: string) {
    const [thread] = await this.db
      .select()
      .from(chatThreads)
      .where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)))
      .limit(1);

    return thread ?? null;
  }

  async createThread(userId: string, input: CreateChatThreadInput) {
    const [thread] = await this.db
      .insert(chatThreads)
      .values({
        userId,
        title: input.title ?? null,
      })
      .returning();

    if (!thread) {
      throw new Error("Failed to create chat thread.");
    }

    return thread;
  }

  async touchThread(threadId: string, title?: string | null) {
    await this.db
      .update(chatThreads)
      .set({
        title: title ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(chatThreads.id, threadId));
  }

  async listMessagesByThreadId(threadId: string) {
    return this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.threadId, threadId))
      .orderBy(asc(chatMessages.createdAt));
  }

  async createMessage(
    threadId: string,
    role: "user" | "assistant" | "system",
    content: string,
    metadata: Record<string, unknown> = {},
  ) {
    const [message] = await this.db
      .insert(chatMessages)
      .values({
        threadId,
        role,
        content,
        metadata,
      })
      .returning();

    if (!message) {
      throw new Error("Failed to create chat message.");
    }

    return message;
  }

  async createProposal(
    userId: string,
    threadId: string,
    sourceMessageId: string | null,
    proposal: RawAiProposal,
    validationStatus: ProposalValidationStatus,
    validationErrors: string[],
  ) {
    return this.db.transaction(async (tx) => {
      await tx
        .update(aiProposals)
        .set({
          status: "superseded",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiProposals.userId, userId),
            eq(aiProposals.threadId, threadId),
            eq(aiProposals.intent, proposal.intent),
            eq(aiProposals.targetDomain, proposal.targetDomain),
            eq(aiProposals.status, "pending"),
          ),
        );

      const [record] = await tx
        .insert(aiProposals)
        .values({
          userId,
          threadId,
          sourceMessageId,
          intent: proposal.intent,
          targetDomain: proposal.targetDomain,
          title: proposal.title,
          reason: proposal.reason,
          proposedChanges: proposal.proposedChanges as Record<string, unknown>,
          validationStatus,
          validationErrors,
        })
        .returning();

      if (!record) {
        throw new Error("Failed to create AI proposal.");
      }

      return record;
    });
  }

  async listProposalsByThreadId(userId: string, threadId: string) {
    return this.db
      .select()
      .from(aiProposals)
      .where(and(eq(aiProposals.userId, userId), eq(aiProposals.threadId, threadId)))
      .orderBy(desc(aiProposals.createdAt));
  }
}

export type ChatThreadRow = typeof chatThreads.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type AiProposalRow = typeof aiProposals.$inferSelect;

export type CreateProposalParams = {
  userId: string;
  threadId: string;
  sourceMessageId: string | null;
  intent: ProposalIntent;
  targetDomain: ProposalTargetDomain;
  title: string;
  reason: string;
  proposedChanges: Record<string, unknown>;
  status?: ProposalStatus;
  validationStatus?: ProposalValidationStatus;
  validationErrors?: string[];
};
