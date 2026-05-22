import { aiProposals } from "@health/db";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

@Injectable()
export class ProposalsRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async findById(userId: string, proposalId: string) {
    const [proposal] = await this.db
      .select()
      .from(aiProposals)
      .where(and(eq(aiProposals.id, proposalId), eq(aiProposals.userId, userId)))
      .limit(1);

    return proposal ?? null;
  }

  async listByUserId(userId: string, threadId?: string) {
    const filters = threadId
      ? and(eq(aiProposals.userId, userId), eq(aiProposals.threadId, threadId))
      : eq(aiProposals.userId, userId);

    return this.db
      .select()
      .from(aiProposals)
      .where(filters)
      .orderBy(desc(aiProposals.createdAt));
  }

  async claimPendingForReject(
    proposalId: string,
    userId: string,
    validationStatus: "valid" | "invalid",
    validationErrors: string[],
  ) {
    const [proposal] = await this.db
      .update(aiProposals)
      .set({
        status: "rejected",
        appliedReference: null,
        validationStatus,
        validationErrors,
        userDecisionAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiProposals.id, proposalId),
          eq(aiProposals.userId, userId),
          eq(aiProposals.status, "pending"),
        ),
      )
      .returning();

    return proposal ?? null;
  }

  async claimPendingForAccept(proposalId: string, userId: string) {
    const [proposal] = await this.db
      .update(aiProposals)
      .set({
        status: "accepted",
        appliedReference: null,
        validationStatus: "valid",
        validationErrors: [],
        userDecisionAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiProposals.id, proposalId),
          eq(aiProposals.userId, userId),
          eq(aiProposals.status, "pending"),
        ),
      )
      .returning();

    return proposal ?? null;
  }

  async finalizeAcceptedProposal(proposalId: string, appliedReference: string) {
    const [proposal] = await this.db
      .update(aiProposals)
      .set({
        appliedReference,
        updatedAt: new Date(),
      })
      .where(
        and(eq(aiProposals.id, proposalId), eq(aiProposals.status, "accepted")),
      )
      .returning();

    return proposal ?? null;
  }

  async revertAcceptedClaim(proposalId: string, userId: string) {
    const [proposal] = await this.db
      .update(aiProposals)
      .set({
        status: "pending",
        appliedReference: null,
        userDecisionAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiProposals.id, proposalId),
          eq(aiProposals.userId, userId),
          eq(aiProposals.status, "accepted"),
          isNull(aiProposals.appliedReference),
        ),
      )
      .returning();

    return proposal ?? null;
  }

  async markValidation(
    proposalId: string,
    validationStatus: "valid" | "invalid",
    validationErrors: string[],
  ) {
    const [proposal] = await this.db
      .update(aiProposals)
      .set({
        validationStatus,
        validationErrors,
        updatedAt: new Date(),
      })
      .where(eq(aiProposals.id, proposalId))
      .returning();

    return proposal ?? null;
  }
}
