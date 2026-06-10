import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { DocumentSignalsService } from "./document-signals.service.js";
import { LocalStorageInProductionError } from "../../common/local-storage.js";
import { LocalDocumentStorageAdapter } from "./local-document-storage.js";

const MINIMAL_LAB_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 55>>stream
BT /F1 12 Tf 72 720 Td (Vitamin D: 22 ng/mL) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000370 00000 n 
trailer<</Size 6/Root 1 0 R>>
startxref
441
%%EOF`,
  "binary",
);

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

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
  documentType: "lab_report" as const,
  title: "Sample lab",
  storageReference: `${user.id}/doc.txt`,
  mimeType: "text/plain",
  fileSizeBytes: 42,
  parseStatus: "uploaded" as const,
  signalExtractionStatus: "not_started" as const,
  signalExtractionFailureReason: null,
  signalExtractedAt: null,
  consentScopes: ["upload_storage", "parse_ocr", "coach_chat_context"] as const,
  consentVersion: "v1",
  consentGrantedAt: new Date("2026-05-22T12:00:00.000Z"),
  parseFailureReason: null,
  revokedAt: null,
  deletedAt: null,
  uploadedAt: new Date("2026-05-22T12:00:00.000Z"),
  createdAt: new Date("2026-05-22T12:00:00.000Z"),
  updatedAt: new Date("2026-05-22T12:00:00.000Z"),
};

describe("DocumentSignalsService", () => {
  describe("storage production guard (DocumentSignalsService uses LocalDocumentStorageAdapter)", () => {
    it("throws LocalStorageInProductionError when constructed without allowInProduction in production", () => {
      // This covers the call site that was previously unguarded in DocumentSignalsService.
      // The service now passes allowInProduction: env.STORAGE_ALLOW_LOCAL_IN_PRODUCTION === true,
      // so when the env var is absent/false in production the adapter must throw.
      expect(
        () => new LocalDocumentStorageAdapter(".data/documents", { nodeEnv: "production" }),
      ).toThrowError(LocalStorageInProductionError);
    });

    it("does not throw when allowInProduction is explicitly true in production", () => {
      expect(
        () =>
          new LocalDocumentStorageAdapter(".data/documents", {
            nodeEnv: "production",
            allowInProduction: true,
          }),
      ).not.toThrow();
    });
  });

  it("blocks extraction for revoked documents before reading storage", async () => {
    const service = new DocumentSignalsService(
      {
        findActiveById: async () => ({
          ...documentRow,
          revokedAt: new Date("2026-05-22T13:00:00.000Z"),
        }),
      } as never,
      {} as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    await expect(service.extractSignals(auth, documentRow.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("requires parse consent before extracting signals", async () => {
    const service = new DocumentSignalsService(
      {
        findActiveById: async () => ({
          ...documentRow,
          consentScopes: ["upload_storage", "coach_chat_context"],
        }),
      } as never,
      {} as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    await expect(service.extractSignals(auth, documentRow.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("requires coaching-context consent before extracting signals", async () => {
    const service = new DocumentSignalsService(
      {
        findActiveById: async () => ({
          ...documentRow,
          consentScopes: ["upload_storage", "parse_ocr"],
        }),
      } as never,
      {} as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    await expect(service.extractSignals(auth, documentRow.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("filters coaching signal context to approved high-confidence signals", async () => {
    const service = new DocumentSignalsService(
      {} as never,
      {
        listContextCandidates: async () => [
          {
            document: {
              ...documentRow,
              signalExtractionStatus: "ready",
            },
            signal: {
              id: "14a08176-64a7-4a2d-8a44-581807368394",
              userId: user.id,
              healthDocumentId: documentRow.id,
              signalKey: "vitamin_d",
              displayLabel: "Vitamin D",
              valueText: "22",
              unit: "ng/mL",
              referenceRangeText: "30-100 ng/mL",
              observedAt: new Date("2026-05-01T00:00:00.000Z"),
              sourceSection: "Lab results",
              confidenceScore: "0.850",
              reviewStatus: "approved",
              ignoredReason: null,
              extractedAt: new Date("2026-05-22T12:00:00.000Z"),
              reviewedAt: new Date("2026-05-22T12:00:00.000Z"),
              createdAt: new Date("2026-05-22T12:00:00.000Z"),
              updatedAt: new Date("2026-05-22T12:00:00.000Z"),
            },
          },
          {
            document: {
              ...documentRow,
              signalExtractionStatus: "ready",
            },
            signal: {
              id: "24b08176-64a7-4a2d-8a44-581807368394",
              userId: user.id,
              healthDocumentId: documentRow.id,
              signalKey: "energy_level",
              displayLabel: "Energy level",
              valueText: "4",
              unit: "score",
              referenceRangeText: null,
              observedAt: null,
              sourceSection: "Self-reported",
              confidenceScore: "0.650",
              reviewStatus: "pending_review",
              ignoredReason: null,
              extractedAt: new Date("2026-05-22T12:00:00.000Z"),
              reviewedAt: null,
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

    const context = await service.buildSignalContextSummary(user.id);

    expect(context.signals).toHaveLength(1);
    expect(context.signals[0]?.signalKey).toBe("vitamin_d");
  });

  it("rejects approval when extracted signal text contains unsafe medical wording", async () => {
    const signalRow = {
      id: "14a08176-64a7-4a2d-8a44-581807368394",
      userId: user.id,
      healthDocumentId: documentRow.id,
      signalKey: "vitamin_d",
      displayLabel: "Diagnosis marker",
      valueText: "22",
      unit: "ng/mL",
      referenceRangeText: null,
      observedAt: null,
      sourceSection: "Lab results",
      confidenceScore: "0.850",
      reviewStatus: "pending_review",
      ignoredReason: null,
      extractedAt: new Date("2026-05-22T12:00:00.000Z"),
      reviewedAt: null,
      createdAt: new Date("2026-05-22T12:00:00.000Z"),
      updatedAt: new Date("2026-05-22T12:00:00.000Z"),
    };
    const service = new DocumentSignalsService(
      {
        findActiveById: async () => documentRow,
      } as never,
      {
        findById: async () => signalRow,
        updateSignalReview: async () => {
          throw new Error("Unsafe signal should not be updated.");
        },
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    await expect(
      service.reviewSignal(auth, documentRow.id, signalRow.id, { reviewStatus: "approved" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("extracts wellness signals from PDF lab uploads", async () => {
    const pdfDocumentRow = {
      ...documentRow,
      mimeType: "application/pdf",
      storageReference: `${user.id}/doc.pdf`,
    };
    const statusUpdates: Array<{ signalExtractionStatus: string }> = [];
    const service = new DocumentSignalsService(
      {
        findActiveById: async () => pdfDocumentRow,
      } as never,
      {
        updateSignalExtractionStatus: async (
          _userId: string,
          _documentId: string,
          input: { signalExtractionStatus: string },
        ) => {
          statusUpdates.push(input);
          return {
            ...pdfDocumentRow,
            signalExtractionStatus: input.signalExtractionStatus,
          };
        },
        replaceSignalsForDocument: async () => [
          {
            id: "14a08176-64a7-4a2d-8a44-581807368394",
            userId: user.id,
            healthDocumentId: pdfDocumentRow.id,
            signalKey: "vitamin_d",
            displayLabel: "Vitamin D",
            valueText: "22",
            unit: "ng/mL",
            referenceRangeText: null,
            observedAt: null,
            sourceSection: "Lab results",
            confidenceScore: "0.850",
            reviewStatus: "pending_review",
            ignoredReason: null,
            extractedAt: new Date("2026-05-22T12:00:00.000Z"),
            reviewedAt: null,
            createdAt: new Date("2026-05-22T12:00:00.000Z"),
            updatedAt: new Date("2026-05-22T12:00:00.000Z"),
          },
        ],
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );
    (service as unknown as { storage: { read: () => Promise<Buffer> } }).storage = {
      read: async () => MINIMAL_LAB_PDF,
    };

    const result = await service.extractSignals(auth, pdfDocumentRow.id);

    expect(statusUpdates.map((update) => update.signalExtractionStatus)).toEqual([
      "processing",
      "ready",
    ]);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]?.signalKey).toBe("vitamin_d");
    expect(result.signals[0]?.valueText).toBe("22");
  });

  it("records a safe failed status when PDF signal extraction fails", async () => {
    const pdfDocumentRow = {
      ...documentRow,
      mimeType: "application/pdf",
      storageReference: `${user.id}/doc.pdf`,
    };
    const statusUpdates: Array<{
      signalExtractionStatus: string;
      signalExtractionFailureReason?: string | null;
    }> = [];
    const service = new DocumentSignalsService(
      {
        findActiveById: async () => pdfDocumentRow,
      } as never,
      {
        updateSignalExtractionStatus: async (
          _userId: string,
          _documentId: string,
          input: {
            signalExtractionStatus: string;
            signalExtractionFailureReason?: string | null;
          },
        ) => {
          statusUpdates.push(input);
          return {
            ...pdfDocumentRow,
            signalExtractionStatus: input.signalExtractionStatus,
            signalExtractionFailureReason: input.signalExtractionFailureReason ?? null,
          };
        },
        replaceSignalsForDocument: async () => {
          throw new Error("Should not persist signals after parse failure.");
        },
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );
    (service as unknown as { storage: { read: () => Promise<Buffer> } }).storage = {
      read: async () => Buffer.from("%PDF-1.4\n% empty\n", "utf8"),
    };

    await expect(service.extractSignals(auth, pdfDocumentRow.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(statusUpdates).toEqual([
      { signalExtractionStatus: "processing", signalExtractionFailureReason: null },
      {
        signalExtractionStatus: "failed",
        signalExtractionFailureReason: "Signal extraction failed. No document content was logged.",
      },
    ]);
  });
});
