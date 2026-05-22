import { aiProposals } from "@health/db";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

type AiProposalRow = typeof aiProposals.$inferSelect;

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

  async acceptPendingProposal(
    proposalId: string,
    userId: string,
    applyFn: (proposal: AiProposalRow) => Promise<string>,
  ) {
    let appliedReference: string | null = null;

    try {
      return await this.db.transaction(async (tx) => {
        const [pendingProposal] = await tx
          .select()
          .from(aiProposals)
          .where(
            and(
              eq(aiProposals.id, proposalId),
              eq(aiProposals.userId, userId),
              eq(aiProposals.status, "pending"),
            ),
          )
          .for("update");

        if (!pendingProposal) {
          return null;
        }

        appliedReference = await applyFn(pendingProposal);

        const [acceptedProposal] = await tx
          .update(aiProposals)
          .set({
            status: "accepted",
            appliedReference,
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

        if (!acceptedProposal) {
          throw new Error("Accepted proposal audit record could not be finalized.");
        }

        return acceptedProposal;
      });
    } catch (error) {
      const recoveredProposal = await this.recoverAppliedReferenceAfterAcceptanceFailure(
        proposalId,
        userId,
        appliedReference,
      );

      if (recoveredProposal) {
        return recoveredProposal;
      }

      throw error;
    }
  }

  async recoverAppliedReferenceAfterAcceptanceFailure(
    proposalId: string,
    userId: string,
    appliedReference: string | null,
  ) {
    if (!appliedReference) {
      return null;
    }

    return this.completePendingAcceptance(proposalId, userId, appliedReference);
  }

  async completePendingAcceptance(
    proposalId: string,
    userId: string,
    appliedReference: string,
  ) {
    const [acceptedProposal] = await this.db
      .update(aiProposals)
      .set({
        status: "accepted",
        appliedReference,
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

    if (acceptedProposal) {
      return acceptedProposal;
    }

    return this.repairAcceptedProposalReference(proposalId, userId, appliedReference);
  }

  async repairAcceptedProposalReference(
    proposalId: string,
    userId: string,
    appliedReference: string,
  ) {
    const [repairedProposal] = await this.db
      .update(aiProposals)
      .set({
        appliedReference,
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

    if (repairedProposal) {
      return repairedProposal;
    }

    const [existingProposal] = await this.db
      .select()
      .from(aiProposals)
      .where(
        and(
          eq(aiProposals.id, proposalId),
          eq(aiProposals.userId, userId),
          eq(aiProposals.status, "accepted"),
          eq(aiProposals.appliedReference, appliedReference),
        ),
      )
      .limit(1);

    return existingProposal ?? null;
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
