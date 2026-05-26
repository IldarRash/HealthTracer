import { aiProposals, chatThreads } from "@health/db";
import type {
  ProposalValidationStatus,
  RawAiProposal,
} from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type {
  HealthDatabase,
  HealthDatabaseTransaction,
} from "../../database/database.types.js";

type AiProposalRow = typeof aiProposals.$inferSelect;

@Injectable()
export class ProposalsRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async findThreadById(userId: string, threadId: string) {
    const [thread] = await this.db
      .select()
      .from(chatThreads)
      .where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)))
      .limit(1);

    return thread ?? null;
  }

  async createThreadForUser(userId: string, title?: string | null) {
    const [thread] = await this.db
      .insert(chatThreads)
      .values({
        userId,
        title: title ?? null,
      })
      .returning();

    if (!thread) {
      throw new Error("Failed to create chat thread.");
    }

    return thread;
  }

  async createPendingProposal(
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
          evidenceRefs:
            proposal.evidenceRefs && proposal.evidenceRefs.length > 0
              ? proposal.evidenceRefs
              : null,
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

  async supersedePendingForModify(proposalId: string, userId: string) {
    const [proposal] = await this.db
      .update(aiProposals)
      .set({
        status: "superseded",
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
    applyFn: (proposal: AiProposalRow, tx: HealthDatabaseTransaction) => Promise<string>,
    options?: { proposedChangesOverride?: Record<string, unknown> },
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

        let proposalForApply = pendingProposal;

        if (options?.proposedChangesOverride) {
          const [updatedProposal] = await tx
            .update(aiProposals)
            .set({
              proposedChanges: options.proposedChangesOverride,
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

          if (updatedProposal) {
            proposalForApply = updatedProposal;
          } else {
            proposalForApply = {
              ...pendingProposal,
              proposedChanges: options.proposedChangesOverride,
            };
          }
        }

        appliedReference = await applyFn(proposalForApply, tx);

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

  async findPendingIntentsByUserId(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ intent: aiProposals.intent })
      .from(aiProposals)
      .where(and(eq(aiProposals.userId, userId), eq(aiProposals.status, "pending")));

    return rows.map((row) => row.intent);
  }
}
