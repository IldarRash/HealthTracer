import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DocumentsController } from "./documents.controller.js";

const authA = { clerkUserId: "clerk-user-a", email: "a@example.com", displayName: null };
const authB = { clerkUserId: "clerk-user-b", email: "b@example.com", displayName: null };

const validCreateBody = {
  documentType: "lab_report",
  title: "Blood Panel 2026",
  consentScopes: ["upload_storage"],
  sampleText: "Glucose: 90 mg/dL",
} as const;

function createDocumentsServiceMock() {
  return {
    createDocument: vi.fn(),
    listDocuments: vi.fn(),
    searchDocuments: vi.fn(),
    getDocument: vi.fn(),
    updateConsent: vi.fn(),
    reviewSummary: vi.fn(),
    parseAndSummarize: vi.fn(),
    deleteDocument: vi.fn(),
  };
}

function createDocumentSignalsServiceMock() {
  return {
    listSignals: vi.fn(),
    extractSignals: vi.fn(),
    reviewSignal: vi.fn(),
  };
}

function createCorrelationsServiceMock() {
  return {
    previewInsights: vi.fn(),
  };
}

function createController() {
  const documentsService = createDocumentsServiceMock();
  const documentSignalsService = createDocumentSignalsServiceMock();
  const correlationsService = createCorrelationsServiceMock();
  const controller = new DocumentsController(
    documentsService as never,
    documentSignalsService as never,
    correlationsService as never,
  );

  return { controller, documentsService, documentSignalsService, correlationsService };
}

describe("DocumentsController", () => {
  describe("createDocument — MIME/content validation", () => {
    it("rejects an unsupported mimeType (400)", () => {
      const { controller, documentsService } = createController();

      expect(() =>
        controller.createDocument(authA as never, {
          ...validCreateBody,
          mimeType: "image/png" as never,
        }),
      ).toThrow(BadRequestException);
      expect(documentsService.createDocument).not.toHaveBeenCalled();
    });

    it("rejects a body missing both sampleText and fileContentBase64 (400)", () => {
      const { controller, documentsService } = createController();

      expect(() =>
        controller.createDocument(authA as never, {
          documentType: "lab_report",
          title: "Test",
          consentScopes: ["upload_storage"],
        } as never),
      ).toThrow(BadRequestException);
      expect(documentsService.createDocument).not.toHaveBeenCalled();
    });

    it("rejects a body with both sampleText and fileContentBase64 present (400)", () => {
      const { controller, documentsService } = createController();

      expect(() =>
        controller.createDocument(authA as never, {
          ...validCreateBody,
          fileContentBase64: "dGVzdA==",
        } as never),
      ).toThrow(BadRequestException);
      expect(documentsService.createDocument).not.toHaveBeenCalled();
    });

    it("rejects a title longer than 160 chars (400)", () => {
      const { controller, documentsService } = createController();

      expect(() =>
        controller.createDocument(authA as never, {
          ...validCreateBody,
          title: "t".repeat(161),
        }),
      ).toThrow(BadRequestException);
      expect(documentsService.createDocument).not.toHaveBeenCalled();
    });

    it("rejects an empty consentScopes array (400)", () => {
      const { controller, documentsService } = createController();

      expect(() =>
        controller.createDocument(authA as never, {
          ...validCreateBody,
          consentScopes: [] as never,
        }),
      ).toThrow(BadRequestException);
      expect(documentsService.createDocument).not.toHaveBeenCalled();
    });

    it("accepts a valid create body and delegates to service with caller auth", () => {
      const { controller, documentsService } = createController();
      documentsService.createDocument.mockResolvedValue({ id: "doc-1" });

      controller.createDocument(authA as never, validCreateBody);

      expect(documentsService.createDocument).toHaveBeenCalledWith(
        authA,
        expect.objectContaining({ documentType: "lab_report", title: "Blood Panel 2026" }),
      );
    });
  });

  describe("updateConsent — consent body validation", () => {
    it("rejects an empty consentScopes array when provided (400)", () => {
      const { controller, documentsService } = createController();

      expect(() =>
        controller.updateConsent(authA as never, "doc-1", { consentScopes: [] as never }),
      ).toThrow(BadRequestException);
      expect(documentsService.updateConsent).not.toHaveBeenCalled();
    });

    it("accepts a revoke=true body with no scopes override and delegates to service", () => {
      const { controller, documentsService } = createController();
      documentsService.updateConsent.mockResolvedValue({ id: "doc-1" });

      controller.updateConsent(authA as never, "doc-1", { revoke: true });

      expect(documentsService.updateConsent).toHaveBeenCalledWith(
        authA,
        "doc-1",
        expect.objectContaining({ revoke: true }),
      );
    });
  });

  describe("updateConsent / deleteDocument — ownership forwarding (IDOR seam)", () => {
    it("updateConsent passes caller auth A to the service, not auth B", () => {
      const { controller, documentsService } = createController();
      documentsService.updateConsent.mockResolvedValue({ id: "doc-1" });

      controller.updateConsent(authA as never, "doc-1", { revoke: false });

      const [calledAuth] = documentsService.updateConsent.mock.calls[0]!;
      expect(calledAuth).toEqual(authA);
      expect(calledAuth).not.toEqual(authB);
    });

    it("deleteDocument passes caller auth and documentId to the service", () => {
      const { controller, documentsService } = createController();
      documentsService.deleteDocument.mockResolvedValue({ id: "doc-2" });

      controller.deleteDocument(authA as never, "doc-2");

      expect(documentsService.deleteDocument).toHaveBeenCalledWith(authA, "doc-2");
    });

    it("getDocument passes caller auth and documentId to the service", () => {
      const { controller, documentsService } = createController();
      documentsService.getDocument.mockResolvedValue({ id: "doc-3" });

      controller.getDocument(authA as never, "doc-3");

      expect(documentsService.getDocument).toHaveBeenCalledWith(authA, "doc-3");
    });
  });

  describe("reviewSummary — body validation", () => {
    it("rejects an invalid reviewStatus value (400)", () => {
      const { controller, documentsService } = createController();

      expect(() =>
        controller.reviewSummary(authA as never, "doc-1", { reviewStatus: "pending_review" as never }),
      ).toThrow(BadRequestException);
      expect(documentsService.reviewSummary).not.toHaveBeenCalled();
    });

    it("accepts 'approved' reviewStatus and delegates with caller auth", () => {
      const { controller, documentsService } = createController();
      documentsService.reviewSummary.mockResolvedValue({ id: "sum-1" });

      controller.reviewSummary(authA as never, "doc-1", { reviewStatus: "approved" });

      expect(documentsService.reviewSummary).toHaveBeenCalledWith(
        authA,
        "doc-1",
        expect.objectContaining({ reviewStatus: "approved" }),
      );
    });
  });

  describe("parseDocument — delegates with caller auth", () => {
    it("passes caller auth and documentId to the service", () => {
      const { controller, documentsService } = createController();
      documentsService.parseAndSummarize.mockResolvedValue({ id: "doc-1" });

      controller.parseDocument(authA as never, "doc-1");

      expect(documentsService.parseAndSummarize).toHaveBeenCalledWith(authA, "doc-1");
    });
  });
});
