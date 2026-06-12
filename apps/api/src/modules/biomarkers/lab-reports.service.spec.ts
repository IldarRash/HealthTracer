import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { LabReportsService } from "./lab-reports.service.js";

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

const reportRow = {
  id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
  userId: user.id,
  title: "Annual panel",
  storageReference: `${user.id}/report.txt`,
  mimeType: "text/plain",
  fileSizeBytes: 42,
  status: "uploaded" as const,
  failureCode: null,
  observedAt: null,
  unmappedMarkerCount: 0,
  consentVersion: "v2",
  storeParseConsentAt: new Date("2026-06-01T12:00:00.000Z"),
  coachContextConsentAt: null,
  extractedAt: null,
  deletedAt: null,
  uploadedAt: new Date("2026-06-01T12:00:00.000Z"),
  createdAt: new Date("2026-06-01T12:00:00.000Z"),
  updatedAt: new Date("2026-06-01T12:00:00.000Z"),
};

const usersServiceMock = { resolveFromAuth: async () => user };

// LLM-stage behavior is covered in lab-reports.service.extraction.spec.ts;
// these tests run without a configured provider (the typed-llm_unavailable path).
function createService(repository: Record<string, unknown>) {
  const service = new LabReportsService(
    repository as never,
    usersServiceMock as never,
    null,
  );

  return service;
}

function patchStorage(
  service: LabReportsService,
  storage: Partial<{
    store: (...args: unknown[]) => Promise<string>;
    read: (...args: unknown[]) => Promise<Buffer>;
    delete: (...args: unknown[]) => Promise<void>;
  }>,
) {
  (service as unknown as { storage: unknown }).storage = storage;
}

const validUpload = {
  title: "Annual panel",
  mimeType: "text/plain" as const,
  fileContentBase64: Buffer.from("Glucose: 92 mg/dL", "utf8").toString("base64"),
  consent: { storeAndParse: true as const, coachChat: false },
  consentVersion: "v2",
};

describe("LabReportsService", () => {
  describe("uploadReport", () => {
    it("stores the decoded file and creates the report with upload-time consents", async () => {
      const captured: Array<Record<string, unknown>> = [];
      const service = createService({
        createReport: async (values: Record<string, unknown>) => {
          captured.push(values);
          return { ...reportRow, ...values };
        },
      });
      patchStorage(service, {
        store: async () => `${user.id}/report.txt`,
      });

      const detail = await service.uploadReport(auth, {
        ...validUpload,
        consent: { storeAndParse: true, coachChat: true },
      });

      expect(captured).toHaveLength(1);
      expect(captured[0]?.userId).toBe(user.id);
      expect(captured[0]?.fileSizeBytes).toBeGreaterThan(0);
      expect(captured[0]?.storeParseConsentAt).toBeInstanceOf(Date);
      expect(captured[0]?.coachContextConsentAt).toBeInstanceOf(Date);
      expect(detail.readings).toEqual([]);
    });

    it("leaves coachContextConsentAt null when coach chat consent is not given", async () => {
      const captured: Array<Record<string, unknown>> = [];
      const service = createService({
        createReport: async (values: Record<string, unknown>) => {
          captured.push(values);
          return { ...reportRow, ...values };
        },
      });
      patchStorage(service, { store: async () => `${user.id}/report.txt` });

      await service.uploadReport(auth, validUpload);

      expect(captured[0]?.coachContextConsentAt).toBeNull();
      expect(captured[0]?.storeParseConsentAt).toBeInstanceOf(Date);
    });

    it("rejects an unsupported mime type before touching storage", async () => {
      let created = false;
      const service = createService({
        createReport: async () => {
          created = true;
          return reportRow;
        },
      });

      await expect(
        service.uploadReport(auth, {
          ...validUpload,
          mimeType: "image/png" as never,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(created).toBe(false);
    });

    it("rejects an upload above the byte limit", async () => {
      let created = false;
      const service = createService({
        createReport: async () => {
          created = true;
          return reportRow;
        },
      });

      await expect(
        service.uploadReport(auth, {
          ...validUpload,
          fileContentBase64: Buffer.alloc(5_000_001, 1).toString("base64"),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(created).toBe(false);
    });

    it("rejects empty decoded content", async () => {
      const service = createService({});

      await expect(
        service.uploadReport(auth, { ...validUpload, fileContentBase64: "====" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("updateConsent", () => {
    it("sets coachContextConsentAt when toggled on", async () => {
      const captured: Array<Date | null> = [];
      const service = createService({
        findActiveReportById: async () => reportRow,
        updateReportConsent: async (
          _userId: string,
          _reportId: string,
          consentAt: Date | null,
        ) => {
          captured.push(consentAt);
          return { ...reportRow, coachContextConsentAt: consentAt };
        },
      });

      const report = await service.updateConsent(auth, reportRow.id, { coachChat: true });

      expect(captured[0]).toBeInstanceOf(Date);
      expect(report.coachContextConsentAt).not.toBeNull();
    });

    it("preserves the original consent timestamp when already consented", async () => {
      const existingConsentAt = new Date("2026-06-02T08:00:00.000Z");
      const captured: Array<Date | null> = [];
      const service = createService({
        findActiveReportById: async () => ({
          ...reportRow,
          coachContextConsentAt: existingConsentAt,
        }),
        updateReportConsent: async (
          _userId: string,
          _reportId: string,
          consentAt: Date | null,
        ) => {
          captured.push(consentAt);
          return { ...reportRow, coachContextConsentAt: consentAt };
        },
      });

      await service.updateConsent(auth, reportRow.id, { coachChat: true });

      expect(captured[0]).toEqual(existingConsentAt);
    });

    it("clears coachContextConsentAt when toggled off", async () => {
      const captured: Array<Date | null> = [];
      const service = createService({
        findActiveReportById: async () => ({
          ...reportRow,
          coachContextConsentAt: new Date("2026-06-02T08:00:00.000Z"),
        }),
        updateReportConsent: async (
          _userId: string,
          _reportId: string,
          consentAt: Date | null,
        ) => {
          captured.push(consentAt);
          return { ...reportRow, coachContextConsentAt: consentAt };
        },
      });

      const report = await service.updateConsent(auth, reportRow.id, { coachChat: false });

      expect(captured[0]).toBeNull();
      expect(report.coachContextConsentAt).toBeNull();
    });

    it("throws NotFound for a report the user does not own", async () => {
      const service = createService({ findActiveReportById: async () => null });

      await expect(
        service.updateConsent(auth, reportRow.id, { coachChat: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("deleteReport", () => {
    it("hard-deletes stored bytes and soft-deletes the report cascade", async () => {
      const deletedReferences: string[] = [];
      let softDeleted = false;
      const service = createService({
        findActiveReportById: async () => reportRow,
        softDeleteReport: async () => {
          softDeleted = true;
          return { ...reportRow, deletedAt: new Date() };
        },
      });
      patchStorage(service, {
        delete: async (reference: unknown) => {
          deletedReferences.push(reference as string);
        },
      });

      await service.deleteReport(auth, reportRow.id);

      expect(deletedReferences).toEqual([reportRow.storageReference]);
      expect(softDeleted).toBe(true);
    });

    it("throws NotFound for a report the user does not own", async () => {
      const service = createService({ findActiveReportById: async () => null });

      await expect(service.deleteReport(auth, reportRow.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("extract", () => {
    it("fails with the llm_unavailable typed failure when no provider is configured (missing OPENAI_API_KEY)", async () => {
      const statusUpdates: Array<{ status: string; failureCode: string | null }> = [];
      const service = createService({
        findActiveReportById: async () => reportRow,
        updateReportStatus: async (
          _userId: string,
          _reportId: string,
          values: { status: string; failureCode: string | null },
        ) => {
          statusUpdates.push({ status: values.status, failureCode: values.failureCode });
          return { ...reportRow, status: values.status, failureCode: values.failureCode };
        },
        listReadingsByReportId: async () => [],
      });
      patchStorage(service, {
        read: async () => Buffer.from("Glucose: 92 mg/dL", "utf8"),
      });

      const detail = await service.extract(auth, reportRow.id);

      expect(statusUpdates).toEqual([
        { status: "processing", failureCode: null },
        { status: "failed", failureCode: "llm_unavailable" },
      ]);
      expect(detail.report.status).toBe("failed");
      expect(detail.report.failureCode).toBe("llm_unavailable");
      expect(detail.readings).toEqual([]);
    });

    it("rejects a concurrent extraction with 409 while processing", async () => {
      let statusUpdated = false;
      const service = createService({
        findActiveReportById: async () => ({ ...reportRow, status: "processing" as const }),
        updateReportStatus: async () => {
          statusUpdated = true;
          return reportRow;
        },
      });

      await expect(service.extract(auth, reportRow.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(statusUpdated).toBe(false);
    });

    it("records file_unreadable when stored bytes cannot be read", async () => {
      const statusUpdates: Array<{ status: string; failureCode: string | null }> = [];
      const service = createService({
        findActiveReportById: async () => reportRow,
        updateReportStatus: async (
          _userId: string,
          _reportId: string,
          values: { status: string; failureCode: string | null },
        ) => {
          statusUpdates.push({ status: values.status, failureCode: values.failureCode });
          return { ...reportRow, status: values.status, failureCode: values.failureCode };
        },
        listReadingsByReportId: async () => [],
      });
      patchStorage(service, {
        read: async () => {
          throw new Error("synthetic storage failure");
        },
      });

      const detail = await service.extract(auth, reportRow.id);

      expect(statusUpdates.at(-1)).toEqual({
        status: "failed",
        failureCode: "file_unreadable",
      });
      expect(detail.report.failureCode).toBe("file_unreadable");
    });

    it("throws NotFound for a report the user does not own", async () => {
      const service = createService({ findActiveReportById: async () => null });

      await expect(service.extract(auth, reportRow.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("getReport", () => {
    it("returns the report with its readings", async () => {
      const readingRow = {
        id: "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d",
        userId: user.id,
        labReportId: reportRow.id,
        biomarkerKey: "fasting_glucose",
        value: "92.0000",
        valueText: null,
        unit: "mg/dL",
        referenceRangeText: null,
        observedAt: new Date("2026-05-20T00:00:00.000Z"),
        source: "extraction",
        confidence: "0.820",
        userEdited: false,
        deletedAt: null,
        createdAt: new Date("2026-06-01T12:00:00.000Z"),
        updatedAt: new Date("2026-06-01T12:00:00.000Z"),
      };
      const service = createService({
        findActiveReportById: async () => reportRow,
        listReadingsByReportId: async () => [readingRow],
      });

      const detail = await service.getReport(auth, reportRow.id);

      expect(detail.report.id).toBe(reportRow.id);
      expect(detail.readings).toHaveLength(1);
      expect(detail.readings[0]?.value).toBe(92);
      expect(detail.readings[0]?.confidence).toBe(0.82);
      expect(detail.readings[0]?.observedAt).toBe("2026-05-20");
    });
  });
});
