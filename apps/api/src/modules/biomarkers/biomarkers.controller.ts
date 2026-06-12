import {
  createBiomarkerReadingSchema,
  createLabReportSchema,
  updateBiomarkerReadingSchema,
  updateLabReportConsentSchema,
} from "@health/types";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { BiomarkersService } from "./biomarkers.service.js";
import { LabReportsService } from "./lab-reports.service.js";

@Controller()
@UseGuards(ClerkAuthGuard)
export class BiomarkersController {
  constructor(
    private readonly labReportsService: LabReportsService,
    private readonly biomarkersService: BiomarkersService,
  ) {}

  // ── Lab reports ────────────────────────────────────────────────────────────

  @Post("lab-reports")
  uploadReport(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.labReportsService.uploadReport(auth, parseBody(createLabReportSchema, body));
  }

  @Get("lab-reports")
  listReports(@CurrentAuth() auth: ClerkAuthContext) {
    return this.labReportsService.listReports(auth);
  }

  @Get("lab-reports/:reportId")
  getReport(@CurrentAuth() auth: ClerkAuthContext, @Param("reportId") reportId: string) {
    return this.labReportsService.getReport(auth, reportId);
  }

  @Post("lab-reports/:reportId/extract")
  extractReport(@CurrentAuth() auth: ClerkAuthContext, @Param("reportId") reportId: string) {
    return this.labReportsService.extract(auth, reportId);
  }

  @Patch("lab-reports/:reportId/consent")
  updateReportConsent(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("reportId") reportId: string,
    @Body() body: unknown,
  ) {
    return this.labReportsService.updateConsent(
      auth,
      reportId,
      parseBody(updateLabReportConsentSchema, body),
    );
  }

  @Delete("lab-reports/:reportId")
  deleteReport(@CurrentAuth() auth: ClerkAuthContext, @Param("reportId") reportId: string) {
    return this.labReportsService.deleteReport(auth, reportId);
  }

  // ── Biomarkers ─────────────────────────────────────────────────────────────

  @Get("biomarkers")
  getDashboard(@CurrentAuth() auth: ClerkAuthContext) {
    return this.biomarkersService.getDashboard(auth);
  }

  @Post("biomarkers/readings")
  addManualReading(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.biomarkersService.addManualReading(
      auth,
      parseBody(createBiomarkerReadingSchema, body),
    );
  }

  @Patch("biomarkers/readings/:readingId")
  updateReading(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("readingId") readingId: string,
    @Body() body: unknown,
  ) {
    return this.biomarkersService.updateReading(
      auth,
      readingId,
      parseBody(updateBiomarkerReadingSchema, body),
    );
  }

  @Delete("biomarkers/readings/:readingId")
  deleteReading(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("readingId") readingId: string,
  ) {
    return this.biomarkersService.deleteReading(auth, readingId);
  }

  @Get("biomarkers/:biomarkerKey")
  getHistory(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("biomarkerKey") biomarkerKey: string,
  ) {
    return this.biomarkersService.getHistory(auth, biomarkerKey);
  }
}
