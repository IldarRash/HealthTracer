import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { containsUnsafeDocumentSummaryLanguage } from "@health/ai";
import { describe, expect, it } from "vitest";
import { buildGovernedDocumentSummary } from "./document-processing.js";
import { DocumentsService } from "./documents.service.js";

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

const noopDocumentSignalsService = {
  revokeSignalsForDocument: async () => undefined,
} as never;

function createDocumentsService(
  repository: Record<string, unknown>,
  usersService: Record<string, unknown> = {
    resolveFromAuth: async () => user,
  },
) {
  return new DocumentsService(repository as never, noopDocumentSignalsService, usersService as never);
}

const user = {
  id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  displayName: "Test User",
  email: "test@example.com",
  timezone: "UTC",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const documentRow = {
  id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
  userId: user.id,
  documentType: "other" as const,
  title: "Sample note",
  storageReference: `${user.id}/doc.txt`,
  mimeType: "text/plain",
  fileSizeBytes: 42,
  parseStatus: "summary_ready" as const,
  signalExtractionStatus: "not_started" as const,
  signalExtractionFailureReason: null,
  signalExtractedAt: null,
  consentScopes: [
    "upload_storage",
    "parse_ocr",
    "ai_summarization",
    "semantic_indexing",
    "coach_chat_context",
  ] as const,
  consentVersion: "v1",
  consentGrantedAt: new Date("2026-05-22T12:00:00.000Z"),
  parseFailureReason: null,
  revokedAt: null,
  deletedAt: null,
  uploadedAt: new Date("2026-05-22T12:00:00.000Z"),
  createdAt: new Date("2026-05-22T12:00:00.000Z"),
  updatedAt: new Date("2026-05-22T12:00:00.000Z"),
};

describe("DocumentsService", () => {
  it("requires upload consent before creating a document", async () => {
    const service = createDocumentsService({}, {
      resolveFromAuth: async () => user,
    });

    await expect(
      service.createDocument(auth, {
        documentType: "other",
        title: "Sample note",
        consentScopes: ["parse_ocr"],
        consentVersion: "v1",
        mimeType: "text/plain",
        sampleText: "Sample text",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepts base64 file uploads within size bounds", async () => {
    const captured: Array<{ fileSizeBytes: number; mimeType: string }> = [];
    const service = createDocumentsService({
      create: async (_userId: string, input: { fileSizeBytes: number; mimeType: string }) => {
        captured.push({ fileSizeBytes: input.fileSizeBytes, mimeType: input.mimeType });

        return {
          ...documentRow,
          mimeType: input.mimeType,
          fileSizeBytes: input.fileSizeBytes,
        };
      },
    });

    await service.createDocument(auth, {
      documentType: "lab_report",
      title: "Annual panel",
      consentScopes: ["upload_storage"],
      consentVersion: "v1",
      mimeType: "application/pdf",
      fileContentBase64: Buffer.from("%PDF-1.4 sample", "utf8").toString("base64"),
    });

    expect(captured[0]?.mimeType).toBe("application/pdf");
    expect(captured[0]?.fileSizeBytes).toBeGreaterThan(0);
  });

  it("rejects parse requests without parse consent", async () => {
    const service = createDocumentsService(
      {
        findActiveById: async () => ({
          ...documentRow,
          consentScopes: ["upload_storage"],
        }),
        updateParseStatus: async () => documentRow,
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    await expect(service.parseAndSummarize(auth, documentRow.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("rejects parse requests for revoked documents", async () => {
    const service = createDocumentsService(
      {
        findActiveById: async () => ({
          ...documentRow,
          revokedAt: new Date("2026-05-22T12:00:00.000Z"),
        }),
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    await expect(service.parseAndSummarize(auth, documentRow.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("throws when deleting a document the user does not own", async () => {
    const service = createDocumentsService(
      {
        findActiveById: async () => null,
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    await expect(service.deleteDocument(auth, documentRow.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("filters coaching context to approved chat-consented summaries", async () => {
    const service = createDocumentsService(
      {
        listContextCandidates: async () => [
          {
            document: documentRow,
            summary: {
              id: "14a08176-64a7-4a2d-8a44-581807368394",
              healthDocumentId: documentRow.id,
              userId: user.id,
              summaryText: "Approved wellness summary.",
              extractedConstraints: ["Prefer low-impact cardio"],
              searchIndexText: "approved wellness summary",
              reviewStatus: "approved",
              reviewedAt: new Date("2026-05-22T12:00:00.000Z"),
              generatedAt: new Date("2026-05-22T12:00:00.000Z"),
              generatorVersion: "dev-v1",
              createdAt: new Date("2026-05-22T12:00:00.000Z"),
              updatedAt: new Date("2026-05-22T12:00:00.000Z"),
            },
          },
          {
            document: {
              ...documentRow,
              id: "7b1c2d3e-4f5a-6789-abcd-ef0123456789",
              consentScopes: ["upload_storage", "parse_ocr", "ai_summarization"],
            },
            summary: {
              id: "24b08176-64a7-4a2d-8a44-581807368394",
              healthDocumentId: "7b1c2d3e-4f5a-6789-abcd-ef0123456789",
              userId: user.id,
              summaryText: "Missing chat consent.",
              extractedConstraints: [],
              searchIndexText: "missing chat consent",
              reviewStatus: "approved",
              reviewedAt: new Date("2026-05-22T12:00:00.000Z"),
              generatedAt: new Date("2026-05-22T12:00:00.000Z"),
              generatorVersion: "dev-v1",
              createdAt: new Date("2026-05-22T12:00:00.000Z"),
              updatedAt: new Date("2026-05-22T12:00:00.000Z"),
            },
          },
        ],
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    const context = await service.buildDocumentContextSummary(user.id);

    expect(context.items).toHaveLength(1);
    expect(context.items[0]?.documentId).toBe(documentRow.id);
  });

  it("records a safe failed status when document processing fails", async () => {
    const statusUpdates: Array<{ parseStatus: string; parseFailureReason?: string | null }> = [];
    const service = createDocumentsService(
      {
        findActiveById: async () => ({
          ...documentRow,
          parseStatus: "uploaded",
        }),
        updateParseStatus: async (
          _userId: string,
          _documentId: string,
          input: { parseStatus: string; parseFailureReason?: string | null },
        ) => {
          statusUpdates.push(input);
          return {
            ...documentRow,
            parseStatus: input.parseStatus,
            parseFailureReason: input.parseFailureReason ?? null,
          };
        },
        createSummary: async () => {
          throw new Error("Summary should not be created after a read failure.");
        },
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );
    (service as unknown as { storage: { read: () => Promise<Buffer> } }).storage = {
      read: async () => {
        throw new Error("synthetic storage failure");
      },
    };

    await expect(service.parseAndSummarize(auth, documentRow.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(statusUpdates).toEqual([
      { parseStatus: "processing", parseFailureReason: null },
      {
        parseStatus: "failed",
        parseFailureReason: "Processing failed. No document content was logged.",
      },
    ]);
  });

  it("excludes rejected summaries from approved search results", async () => {
    const service = createDocumentsService(
      {
        searchApprovedSummaries: async () => [
          {
            document: documentRow,
            summary: {
              id: "14a08176-64a7-4a2d-8a44-581807368394",
              healthDocumentId: documentRow.id,
              userId: user.id,
              summaryText: "Approved wellness summary.",
              extractedConstraints: ["Prefer low-impact cardio"],
              searchIndexText: "approved wellness summary",
              reviewStatus: "approved",
              reviewedAt: new Date("2026-05-22T12:00:00.000Z"),
              generatedAt: new Date("2026-05-22T12:00:00.000Z"),
              generatorVersion: "dev-v1",
              createdAt: new Date("2026-05-22T12:00:00.000Z"),
              updatedAt: new Date("2026-05-22T12:00:00.000Z"),
            },
          },
          {
            document: {
              ...documentRow,
              id: "7b1c2d3e-4f5a-4789-abcd-ef0123456789",
            },
            summary: {
              id: "24b08176-64a7-4a2d-8a44-581807368394",
              healthDocumentId: "7b1c2d3e-4f5a-4789-abcd-ef0123456789",
              userId: user.id,
              summaryText: "Rejected wellness summary.",
              extractedConstraints: ["Prefer easy walks"],
              searchIndexText: "rejected wellness summary",
              reviewStatus: "rejected",
              reviewedAt: new Date("2026-05-22T12:00:00.000Z"),
              generatedAt: new Date("2026-05-22T12:00:00.000Z"),
              generatorVersion: "dev-v1",
              createdAt: new Date("2026-05-22T12:00:00.000Z"),
              updatedAt: new Date("2026-05-22T12:00:00.000Z"),
            },
          },
        ],
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    const results = await service.searchDocuments(auth, { q: "wellness", limit: 10 });

    expect(results.results).toHaveLength(1);
    expect(results.results[0]?.title).toBe("Sample note");
    expect(results.results[0]?.summarySnippet).toContain("Approved wellness summary");
  });

  it("tombstones summaries when deleting a document", async () => {
    let tombstoned = false;
    const service = createDocumentsService(
      {
        findActiveById: async () => documentRow,
        tombstoneSummariesForDocument: async () => {
          tombstoned = true;
        },
        softDelete: async () => ({
          ...documentRow,
          deletedAt: new Date("2026-05-22T13:00:00.000Z"),
          revokedAt: new Date("2026-05-22T13:00:00.000Z"),
          parseStatus: "revoked",
        }),
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );
    (service as unknown as { storage: { delete: () => Promise<void> } }).storage = {
      delete: async () => undefined,
    };

    await service.deleteDocument(auth, documentRow.id);

    expect(tombstoned).toBe(true);
  });

  it("tombstones summaries when revoking consent", async () => {
    let tombstoned = false;
    const service = createDocumentsService(
      {
        findActiveById: async () => documentRow,
        updateConsent: async () => ({
          ...documentRow,
          parseStatus: "revoked",
          revokedAt: new Date("2026-05-22T13:00:00.000Z"),
        }),
        tombstoneSummariesForDocument: async () => {
          tombstoned = true;
        },
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    await service.updateConsent(auth, documentRow.id, { revoke: true });

    expect(tombstoned).toBe(true);
  });

  it("approves safe governed summaries for clinical_note and medication_list types", async () => {
    for (const documentType of ["clinical_note", "medication_list"] as const) {
      const generated = buildGovernedDocumentSummary({
        documentType,
        title: "Follow-up packet",
        plainText: "Prefer low-impact activity on rest days.",
      });

      expect(containsUnsafeDocumentSummaryLanguage(generated.summaryText)).toBe(false);

      let reviewedStatus: string | null = null;
      const service = createDocumentsService(
        {
          findActiveById: async () => ({
            ...documentRow,
            documentType,
          }),
          findLatestSummary: async () => ({
            id: "14a08176-64a7-4a2d-8a44-581807368394",
            healthDocumentId: documentRow.id,
            userId: user.id,
            summaryText: generated.summaryText,
            extractedConstraints: generated.extractedConstraints,
            searchIndexText: generated.searchIndexText,
            reviewStatus: "pending_review",
            reviewedAt: null,
            generatedAt: new Date("2026-05-22T12:00:00.000Z"),
            generatorVersion: "dev-v1",
            createdAt: new Date("2026-05-22T12:00:00.000Z"),
            updatedAt: new Date("2026-05-22T12:00:00.000Z"),
          }),
          updateSummaryReview: async (
            _userId: string,
            _summaryId: string,
            reviewStatus: "approved" | "rejected",
          ) => {
            reviewedStatus = reviewStatus;
            return {
              id: "14a08176-64a7-4a2d-8a44-581807368394",
              healthDocumentId: documentRow.id,
              userId: user.id,
              summaryText: generated.summaryText,
              extractedConstraints: generated.extractedConstraints,
              reviewStatus,
              reviewedAt: new Date("2026-05-22T12:00:00.000Z"),
              generatedAt: new Date("2026-05-22T12:00:00.000Z"),
              generatorVersion: "dev-v1",
              createdAt: new Date("2026-05-22T12:00:00.000Z"),
              updatedAt: new Date("2026-05-22T12:00:00.000Z"),
            };
          },
        } as never,
        {
          resolveFromAuth: async () => user,
        } as never,
      );

      const summary = await service.reviewSummary(auth, documentRow.id, {
        reviewStatus: "approved",
      });

      expect(reviewedStatus).toBe("approved");
      expect(summary.reviewStatus).toBe("approved");
    }
  });

  it("returns consent-approved search rows without post-limit starvation", async () => {
    const service = createDocumentsService(
      {
        searchApprovedSummaries: async (_userId: string, _query: string, limit: number) => {
          expect(limit).toBe(5);
          return Array.from({ length: limit }, (_, index) => ({
            document: {
              ...documentRow,
              id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
              title: `Doc ${index}`,
            },
            summary: {
              id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
              healthDocumentId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
              userId: user.id,
              summaryText: `Approved wellness summary ${index}.`,
              extractedConstraints: [],
              searchIndexText: `approved wellness summary ${index}`,
              reviewStatus: "approved" as const,
              reviewedAt: new Date("2026-05-22T12:00:00.000Z"),
              generatedAt: new Date("2026-05-22T12:00:00.000Z"),
              generatorVersion: "dev-v1",
              createdAt: new Date("2026-05-22T12:00:00.000Z"),
              updatedAt: new Date("2026-05-22T12:00:00.000Z"),
            },
          }));
        },
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    const results = await service.searchDocuments(auth, { q: "wellness", limit: 5 });

    expect(results.results).toHaveLength(5);
  });
});
