import { healthDocumentSummaries, healthDocuments } from "@health/db";
import type {
  CreateHealthDocumentInput,
  DocumentConsentScope,
  DocumentReviewStatus,
} from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, ilike, isNull, sql } from "drizzle-orm";

const TOMBSTONE_SUMMARY_TEXT =
  "Summary removed after document revocation or deletion.";
const CONTEXT_CANDIDATE_OVERFETCH = 3;
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

function hasDocumentConsentScopeInDb(scope: DocumentConsentScope) {
  return sql`${healthDocuments.consentScopes} @> ${JSON.stringify([scope])}::jsonb`;
}

@Injectable()
export class DocumentsRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async create(userId: string, input: CreateHealthDocumentInput & {
    id: string;
    storageReference: string;
    fileSizeBytes: number;
  }) {
    const [document] = await this.db
      .insert(healthDocuments)
      .values({
        id: input.id,
        userId,
        documentType: input.documentType,
        title: input.title,
        storageReference: input.storageReference,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        consentScopes: input.consentScopes,
        consentVersion: input.consentVersion,
      })
      .returning();

    if (!document) {
      throw new Error("Failed to create health document.");
    }

    return document;
  }

  async listActiveByUserId(userId: string) {
    return this.db
      .select()
      .from(healthDocuments)
      .where(and(eq(healthDocuments.userId, userId), isNull(healthDocuments.deletedAt)))
      .orderBy(sql`${healthDocuments.uploadedAt} desc`);
  }

  async findActiveById(userId: string, documentId: string) {
    const [document] = await this.db
      .select()
      .from(healthDocuments)
      .where(
        and(
          eq(healthDocuments.id, documentId),
          eq(healthDocuments.userId, userId),
          isNull(healthDocuments.deletedAt),
        ),
      )
      .limit(1);

    return document ?? null;
  }

  async findLatestSummary(documentId: string) {
    const [summary] = await this.db
      .select()
      .from(healthDocumentSummaries)
      .where(eq(healthDocumentSummaries.healthDocumentId, documentId))
      .orderBy(sql`${healthDocumentSummaries.generatedAt} desc`)
      .limit(1);

    return summary ?? null;
  }

  async updateParseStatus(
    userId: string,
    documentId: string,
    values: {
      parseStatus: typeof healthDocuments.$inferInsert.parseStatus;
      parseFailureReason?: string | null;
    },
  ) {
    const [document] = await this.db
      .update(healthDocuments)
      .set({
        parseStatus: values.parseStatus,
        parseFailureReason: values.parseFailureReason ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(healthDocuments.id, documentId), eq(healthDocuments.userId, userId)))
      .returning();

    return document ?? null;
  }

  async updateConsent(
    userId: string,
    documentId: string,
    values: {
      consentScopes?: DocumentConsentScope[];
      revokedAt?: Date | null;
      parseStatus?: typeof healthDocuments.$inferInsert.parseStatus;
    },
  ) {
    const [document] = await this.db
      .update(healthDocuments)
      .set({
        ...(values.consentScopes ? { consentScopes: values.consentScopes } : {}),
        ...(values.revokedAt !== undefined ? { revokedAt: values.revokedAt } : {}),
        ...(values.parseStatus ? { parseStatus: values.parseStatus } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(healthDocuments.id, documentId), eq(healthDocuments.userId, userId)))
      .returning();

    return document ?? null;
  }

  async tombstoneSummariesForDocument(userId: string, documentId: string) {
    const now = new Date();

    await this.db
      .update(healthDocumentSummaries)
      .set({
        summaryText: TOMBSTONE_SUMMARY_TEXT,
        searchIndexText: "",
        extractedConstraints: [],
        reviewStatus: "rejected",
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(healthDocumentSummaries.healthDocumentId, documentId),
          eq(healthDocumentSummaries.userId, userId),
        ),
      );
  }

  async softDelete(userId: string, documentId: string) {
    const now = new Date();
    const [document] = await this.db
      .update(healthDocuments)
      .set({
        deletedAt: now,
        revokedAt: now,
        parseStatus: "revoked",
        updatedAt: now,
      })
      .where(and(eq(healthDocuments.id, documentId), eq(healthDocuments.userId, userId)))
      .returning();

    return document ?? null;
  }

  async createSummary(values: {
    healthDocumentId: string;
    userId: string;
    summaryText: string;
    extractedConstraints: string[];
    searchIndexText: string;
    reviewStatus?: DocumentReviewStatus;
    generatorVersion?: string;
  }) {
    const [summary] = await this.db
      .insert(healthDocumentSummaries)
      .values(values)
      .returning();

    if (!summary) {
      throw new Error("Failed to create document summary.");
    }

    return summary;
  }

  async updateSummaryReview(
    userId: string,
    summaryId: string,
    reviewStatus: Extract<DocumentReviewStatus, "approved" | "rejected">,
  ) {
    const now = new Date();
    const [summary] = await this.db
      .update(healthDocumentSummaries)
      .set({
        reviewStatus,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(healthDocumentSummaries.id, summaryId),
          eq(healthDocumentSummaries.userId, userId),
        ),
      )
      .returning();

    return summary ?? null;
  }

  async searchApprovedSummaries(userId: string, query: string, limit: number) {
    return this.db
      .select({
        document: healthDocuments,
        summary: healthDocumentSummaries,
      })
      .from(healthDocumentSummaries)
      .innerJoin(
        healthDocuments,
        eq(healthDocumentSummaries.healthDocumentId, healthDocuments.id),
      )
      .where(
        and(
          eq(healthDocumentSummaries.userId, userId),
          eq(healthDocuments.userId, userId),
          isNull(healthDocuments.deletedAt),
          isNull(healthDocuments.revokedAt),
          eq(healthDocumentSummaries.reviewStatus, "approved"),
          eq(healthDocuments.parseStatus, "summary_ready"),
          hasDocumentConsentScopeInDb("semantic_indexing"),
          ilike(healthDocumentSummaries.searchIndexText, `%${query.toLowerCase()}%`),
        ),
      )
      .orderBy(sql`${healthDocumentSummaries.generatedAt} desc`)
      .limit(limit);
  }

  async listContextCandidates(userId: string, limit = 20) {
    return this.db
      .select({
        document: healthDocuments,
        summary: healthDocumentSummaries,
      })
      .from(healthDocumentSummaries)
      .innerJoin(
        healthDocuments,
        eq(healthDocumentSummaries.healthDocumentId, healthDocuments.id),
      )
      .where(
        and(
          eq(healthDocumentSummaries.userId, userId),
          eq(healthDocuments.userId, userId),
          isNull(healthDocuments.deletedAt),
          isNull(healthDocuments.revokedAt),
          eq(healthDocumentSummaries.reviewStatus, "approved"),
          eq(healthDocuments.parseStatus, "summary_ready"),
          hasDocumentConsentScopeInDb("coach_chat_context"),
        ),
      )
      .orderBy(sql`${healthDocumentSummaries.generatedAt} desc`)
      .limit(limit * CONTEXT_CANDIDATE_OVERFETCH);
  }
}
