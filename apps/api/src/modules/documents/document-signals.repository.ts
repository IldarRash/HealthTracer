import { documentSignals, healthDocuments } from "@health/db";
import {
  MIN_DOCUMENT_SIGNAL_CONFIDENCE_FOR_CONTEXT,
  type DocumentSignalReviewStatus,
} from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";
import { toSignalInsertValues } from "./document-signal.mapper.js";
import type { ExtractedDocumentSignalDraft } from "@health/types";

@Injectable()
export class DocumentSignalsRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async listByDocumentId(userId: string, documentId: string) {
    return this.db
      .select()
      .from(documentSignals)
      .where(
        and(
          eq(documentSignals.userId, userId),
          eq(documentSignals.healthDocumentId, documentId),
        ),
      )
      .orderBy(sql`${documentSignals.extractedAt} desc`);
  }

  async findById(userId: string, signalId: string) {
    const [signal] = await this.db
      .select()
      .from(documentSignals)
      .where(and(eq(documentSignals.userId, userId), eq(documentSignals.id, signalId)))
      .limit(1);

    return signal ?? null;
  }

  async replaceSignalsForDocument(
    userId: string,
    documentId: string,
    drafts: ExtractedDocumentSignalDraft[],
  ) {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(documentSignals)
        .where(
          and(
            eq(documentSignals.userId, userId),
            eq(documentSignals.healthDocumentId, documentId),
          ),
        );

      if (drafts.length === 0) {
        return [];
      }

      return tx
        .insert(documentSignals)
        .values(drafts.map((draft) => toSignalInsertValues(userId, documentId, draft)))
        .returning();
    });
  }

  async updateSignalReview(
    userId: string,
    signalId: string,
    reviewStatus: Extract<DocumentSignalReviewStatus, "approved" | "rejected" | "ignored">,
    ignoredReason: string | null,
  ) {
    const now = new Date();
    const [signal] = await this.db
      .update(documentSignals)
      .set({
        reviewStatus,
        ignoredReason,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(and(eq(documentSignals.userId, userId), eq(documentSignals.id, signalId)))
      .returning();

    return signal ?? null;
  }

  async updateSignalExtractionStatus(
    userId: string,
    documentId: string,
    values: {
      signalExtractionStatus: typeof healthDocuments.$inferInsert.signalExtractionStatus;
      signalExtractionFailureReason?: string | null;
      signalExtractedAt?: Date | null;
    },
  ) {
    const [document] = await this.db
      .update(healthDocuments)
      .set({
        signalExtractionStatus: values.signalExtractionStatus,
        signalExtractionFailureReason: values.signalExtractionFailureReason ?? null,
        signalExtractedAt:
          values.signalExtractedAt !== undefined ? values.signalExtractedAt : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(healthDocuments.id, documentId), eq(healthDocuments.userId, userId)))
      .returning();

    return document ?? null;
  }

  async tombstoneSignalsForDocument(userId: string, documentId: string) {
    const now = new Date();

    await this.db
      .update(documentSignals)
      .set({
        reviewStatus: "rejected",
        ignoredReason: "Removed after document revocation or deletion.",
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(documentSignals.userId, userId),
          eq(documentSignals.healthDocumentId, documentId),
        ),
      );
  }

  async listContextCandidates(userId: string, limit = 40) {
    return this.db
      .select({
        document: healthDocuments,
        signal: documentSignals,
      })
      .from(documentSignals)
      .innerJoin(healthDocuments, eq(documentSignals.healthDocumentId, healthDocuments.id))
      .where(
        and(
          eq(documentSignals.userId, userId),
          eq(healthDocuments.userId, userId),
          isNull(healthDocuments.deletedAt),
          isNull(healthDocuments.revokedAt),
          eq(healthDocuments.signalExtractionStatus, "ready"),
          eq(documentSignals.reviewStatus, "approved"),
          sql`${healthDocuments.consentScopes} @> ${JSON.stringify(["coach_chat_context"])}::jsonb`,
        ),
      )
      .orderBy(sql`${documentSignals.extractedAt} desc`)
      .limit(limit);
  }

  async listCorrelationCandidates(userId: string, limit = 40) {
    return this.listContextCandidates(userId, limit);
  }

  async findApprovedSignalById(userId: string, signalId: string) {
    return this.findCorrelationEligibleSignalById(userId, signalId);
  }

  async findCorrelationEligibleSignalById(userId: string, signalId: string) {
    const [row] = await this.db
      .select({
        document: healthDocuments,
        signal: documentSignals,
      })
      .from(documentSignals)
      .innerJoin(healthDocuments, eq(documentSignals.healthDocumentId, healthDocuments.id))
      .where(
        and(
          eq(documentSignals.userId, userId),
          eq(documentSignals.id, signalId),
          eq(documentSignals.reviewStatus, "approved"),
          isNull(healthDocuments.deletedAt),
          isNull(healthDocuments.revokedAt),
          eq(healthDocuments.signalExtractionStatus, "ready"),
          sql`${healthDocuments.consentScopes} @> ${JSON.stringify(["coach_chat_context"])}::jsonb`,
          sql`CAST(${documentSignals.confidenceScore} AS numeric) >= ${MIN_DOCUMENT_SIGNAL_CONFIDENCE_FOR_CONTEXT}`,
        ),
      )
      .limit(1);

    return row ?? null;
  }
}
