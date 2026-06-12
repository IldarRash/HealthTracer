import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { BiomarkersController } from "./biomarkers.controller.js";

const authA = { clerkUserId: "clerk-user-a", email: "a@example.com", displayName: null };
const authB = { clerkUserId: "clerk-user-b", email: "b@example.com", displayName: null };

const validUploadBody = {
  title: "Annual panel",
  mimeType: "text/plain",
  fileContentBase64: Buffer.from("Glucose: 92 mg/dL", "utf8").toString("base64"),
  consent: { storeAndParse: true, coachChat: false },
} as const;

function createLabReportsServiceMock() {
  return {
    uploadReport: vi.fn(),
    listReports: vi.fn(),
    getReport: vi.fn(),
    extract: vi.fn(),
    updateConsent: vi.fn(),
    deleteReport: vi.fn(),
  };
}

function createBiomarkersServiceMock() {
  return {
    getDashboard: vi.fn(),
    getHistory: vi.fn(),
    addManualReading: vi.fn(),
    updateReading: vi.fn(),
    deleteReading: vi.fn(),
  };
}

function createController() {
  const labReportsService = createLabReportsServiceMock();
  const biomarkersService = createBiomarkersServiceMock();
  const controller = new BiomarkersController(
    labReportsService as never,
    biomarkersService as never,
  );

  return { controller, labReportsService, biomarkersService };
}

describe("BiomarkersController", () => {
  it("is protected by the Clerk auth guard", () => {
    const guards: unknown[] = Reflect.getMetadata("__guards__", BiomarkersController) ?? [];

    expect(guards).toContain(ClerkAuthGuard);
  });

  describe("uploadReport — body validation", () => {
    it("rejects a body without the required store-and-parse consent (400)", () => {
      const { controller, labReportsService } = createController();

      expect(() =>
        controller.uploadReport(authA as never, {
          ...validUploadBody,
          consent: { storeAndParse: false, coachChat: false },
        }),
      ).toThrow(BadRequestException);
      expect(labReportsService.uploadReport).not.toHaveBeenCalled();
    });

    it("rejects a body missing the consent object entirely (400)", () => {
      const { controller, labReportsService } = createController();
      const withoutConsent = {
        title: validUploadBody.title,
        mimeType: validUploadBody.mimeType,
        fileContentBase64: validUploadBody.fileContentBase64,
      };

      expect(() => controller.uploadReport(authA as never, withoutConsent)).toThrow(
        BadRequestException,
      );
      expect(labReportsService.uploadReport).not.toHaveBeenCalled();
    });

    it("rejects an unsupported mimeType (400)", () => {
      const { controller, labReportsService } = createController();

      expect(() =>
        controller.uploadReport(authA as never, {
          ...validUploadBody,
          mimeType: "image/png",
        }),
      ).toThrow(BadRequestException);
      expect(labReportsService.uploadReport).not.toHaveBeenCalled();
    });

    it("accepts a valid body, applies the consentVersion default, and delegates with caller auth", () => {
      const { controller, labReportsService } = createController();
      labReportsService.uploadReport.mockResolvedValue({ report: { id: "report-1" } });

      controller.uploadReport(authA as never, validUploadBody);

      expect(labReportsService.uploadReport).toHaveBeenCalledWith(
        authA,
        expect.objectContaining({
          title: "Annual panel",
          consentVersion: "v2",
          consent: { storeAndParse: true, coachChat: false },
        }),
      );
    });
  });

  describe("updateReportConsent — body validation", () => {
    it("rejects a body without a boolean coachChat (400)", () => {
      const { controller, labReportsService } = createController();

      expect(() =>
        controller.updateReportConsent(authA as never, "report-1", { coachChat: "yes" }),
      ).toThrow(BadRequestException);
      expect(labReportsService.updateConsent).not.toHaveBeenCalled();
    });

    it("delegates a valid consent toggle with caller auth", () => {
      const { controller, labReportsService } = createController();
      labReportsService.updateConsent.mockResolvedValue({ id: "report-1" });

      controller.updateReportConsent(authA as never, "report-1", { coachChat: true });

      expect(labReportsService.updateConsent).toHaveBeenCalledWith(authA, "report-1", {
        coachChat: true,
      });
    });
  });

  describe("addManualReading — body validation", () => {
    it("rejects a body with both value and valueText (400)", () => {
      const { controller, biomarkersService } = createController();

      expect(() =>
        controller.addManualReading(authA as never, {
          biomarkerKey: "fasting_glucose",
          value: 92,
          valueText: "ninety-two",
          unit: "mg/dL",
        }),
      ).toThrow(BadRequestException);
      expect(biomarkersService.addManualReading).not.toHaveBeenCalled();
    });

    it("rejects a body with neither value nor valueText (400)", () => {
      const { controller, biomarkersService } = createController();

      expect(() =>
        controller.addManualReading(authA as never, {
          biomarkerKey: "fasting_glucose",
          unit: "mg/dL",
        }),
      ).toThrow(BadRequestException);
      expect(biomarkersService.addManualReading).not.toHaveBeenCalled();
    });

    it("rejects an unknown biomarkerKey (400)", () => {
      const { controller, biomarkersService } = createController();

      expect(() =>
        controller.addManualReading(authA as never, {
          biomarkerKey: "not_a_marker",
          value: 92,
          unit: "mg/dL",
        }),
      ).toThrow(BadRequestException);
      expect(biomarkersService.addManualReading).not.toHaveBeenCalled();
    });

    it("delegates a valid manual reading with caller auth", () => {
      const { controller, biomarkersService } = createController();
      biomarkersService.addManualReading.mockResolvedValue({ id: "reading-1" });

      controller.addManualReading(authA as never, {
        biomarkerKey: "fasting_glucose",
        value: 92,
        unit: "mg/dL",
        observedAt: "2026-05-20",
      });

      expect(biomarkersService.addManualReading).toHaveBeenCalledWith(
        authA,
        expect.objectContaining({ biomarkerKey: "fasting_glucose", value: 92 }),
      );
    });
  });

  describe("updateReading — body validation", () => {
    it("rejects an empty update body (400)", () => {
      const { controller, biomarkersService } = createController();

      expect(() => controller.updateReading(authA as never, "reading-1", {})).toThrow(
        BadRequestException,
      );
      expect(biomarkersService.updateReading).not.toHaveBeenCalled();
    });

    it("delegates a valid update with caller auth and readingId", () => {
      const { controller, biomarkersService } = createController();
      biomarkersService.updateReading.mockResolvedValue({ id: "reading-1" });

      controller.updateReading(authA as never, "reading-1", { value: 95 });

      expect(biomarkersService.updateReading).toHaveBeenCalledWith(
        authA,
        "reading-1",
        expect.objectContaining({ value: 95 }),
      );
    });
  });

  describe("ownership forwarding (IDOR seam)", () => {
    it("extractReport passes caller auth A to the service, not auth B", () => {
      const { controller, labReportsService } = createController();
      labReportsService.extract.mockResolvedValue({ report: { id: "report-1" } });

      controller.extractReport(authA as never, "report-1");

      const [calledAuth, calledReportId] = labReportsService.extract.mock.calls[0]!;
      expect(calledAuth).toEqual(authA);
      expect(calledAuth).not.toEqual(authB);
      expect(calledReportId).toBe("report-1");
    });

    it("deleteReport passes caller auth and reportId to the service", () => {
      const { controller, labReportsService } = createController();
      labReportsService.deleteReport.mockResolvedValue({ id: "report-2" });

      controller.deleteReport(authA as never, "report-2");

      expect(labReportsService.deleteReport).toHaveBeenCalledWith(authA, "report-2");
    });

    it("deleteReading passes caller auth and readingId to the service", () => {
      const { controller, biomarkersService } = createController();
      biomarkersService.deleteReading.mockResolvedValue({ id: "reading-2" });

      controller.deleteReading(authA as never, "reading-2");

      expect(biomarkersService.deleteReading).toHaveBeenCalledWith(authA, "reading-2");
    });

    it("getHistory passes caller auth and the raw biomarker key to the service", () => {
      const { controller, biomarkersService } = createController();
      biomarkersService.getHistory.mockResolvedValue({ readings: [] });

      controller.getHistory(authA as never, "fasting_glucose");

      expect(biomarkersService.getHistory).toHaveBeenCalledWith(authA, "fasting_glucose");
    });
  });
});
