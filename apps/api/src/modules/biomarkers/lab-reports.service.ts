import {
  containsUnsafeMedicalLanguage,
  type LabExtractionProvider,
  type ProviderCallResult,
} from "@health/ai";
import type {
  CreateLabReportInput,
  LabExtractionOutput,
  LabExtractionOutputInput,
  LabReport,
  LabReportDetail,
  LabReportFailureCode,
  LabReportListResponse,
  SupportedLabReportMimeType,
  UpdateLabReportConsentInput,
} from "@health/types";
import {
  BIOMARKER_PLAUSIBILITY_FACTOR,
  getBiomarkerCatalogEntry,
  labExtractionOutputSchema,
  MAX_LAB_REPORT_UPLOAD_BYTES,
  SUPPORTED_LAB_REPORT_MIME_TYPES,
  validateBiomarkerReadingValue,
} from "@health/types";
import type { BiomarkerKey } from "@health/types";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { env } from "../../env.js";
import { UsersService } from "../users/users.service.js";
import {
  BiomarkersRepository,
  type NewBiomarkerReadingValues,
} from "./biomarkers.repository.js";
import { LabDocumentParser } from "./lab-document-parser.js";
import { LAB_EXTRACTION_PROVIDER } from "./lab-extraction.tokens.js";
import {
  isoDateToTimestamp,
  toLabReport,
  toLabReportDetail,
} from "./lab-report.mapper.js";
import {
  LocalLabReportStorageAdapter,
  type LabReportStorageAdapter,
} from "./local-lab-report-storage.js";

/** Wall-clock budget for one lab-extraction LLM call, including its retries. */
const LAB_EXTRACTION_TIMEOUT_MS = 60_000;

@Injectable()
export class LabReportsService {
  private readonly storage: LabReportStorageAdapter;
  private readonly parser: LabDocumentParser;

  constructor(
    private readonly biomarkersRepository: BiomarkersRepository,
    private readonly usersService: UsersService,
    @Inject(LAB_EXTRACTION_PROVIDER)
    private readonly labExtractionProvider: LabExtractionProvider | null,
  ) {
    this.storage = new LocalLabReportStorageAdapter(env.LAB_REPORT_STORAGE_PATH, {
      allowInProduction: env.STORAGE_ALLOW_LOCAL_IN_PRODUCTION === true,
    });
    this.parser = new LabDocumentParser();
  }

  async uploadReport(
    auth: ClerkAuthContext,
    input: CreateLabReportInput,
  ): Promise<LabReportDetail> {
    // Defense-in-depth behind the Zod contract: the storage extension and the
    // parser both branch on this value.
    if (!SUPPORTED_LAB_REPORT_MIME_TYPES.includes(input.mimeType)) {
      throw new BadRequestException("Unsupported lab report mime type.");
    }

    const content = Buffer.from(input.fileContentBase64, "base64");

    if (content.byteLength === 0) {
      throw new BadRequestException("Uploaded lab report content is empty.");
    }

    if (content.byteLength > MAX_LAB_REPORT_UPLOAD_BYTES) {
      throw new BadRequestException(
        `Uploaded lab report exceeds the ${MAX_LAB_REPORT_UPLOAD_BYTES} byte limit.`,
      );
    }

    const user = await this.usersService.resolveFromAuth(auth);
    const reportId = crypto.randomUUID();
    const storageReference = await this.storage.store(
      user.id,
      reportId,
      content,
      input.mimeType,
    );

    const now = new Date();
    const report = await this.biomarkersRepository.createReport({
      id: reportId,
      userId: user.id,
      title: input.title,
      storageReference,
      mimeType: input.mimeType,
      fileSizeBytes: content.byteLength,
      consentVersion: input.consentVersion,
      storeParseConsentAt: now,
      coachContextConsentAt: input.consent.coachChat ? now : null,
    });

    return toLabReportDetail(report, []);
  }

  async listReports(auth: ClerkAuthContext): Promise<LabReportListResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const reports = await this.biomarkersRepository.listActiveReportsByUserId(user.id);

    return { reports: reports.map(toLabReport) };
  }

  async getReport(auth: ClerkAuthContext, reportId: string): Promise<LabReportDetail> {
    const user = await this.usersService.resolveFromAuth(auth);
    const report = await this.biomarkersRepository.findActiveReportById(user.id, reportId);

    if (!report) {
      throw new NotFoundException("Lab report not found.");
    }

    const readings = await this.biomarkersRepository.listReadingsByReportId(
      user.id,
      reportId,
    );

    return toLabReportDetail(report, readings);
  }

  /**
   * Runs the full extraction pipeline for a report:
   * storage read → parse → dedicated lab-extraction LLM → Zod parse →
   * per-reading validation → transactional reading replacement.
   *
   * Every degradation is a typed failure code on the report — never a fake
   * success. The parsed document text is ephemeral: it goes only to the
   * provider call and is never persisted or logged (all failure reasons are
   * fixed enum strings).
   */
  async extract(auth: ClerkAuthContext, reportId: string): Promise<LabReportDetail> {
    const user = await this.usersService.resolveFromAuth(auth);
    const report = await this.biomarkersRepository.findActiveReportById(user.id, reportId);

    if (!report) {
      throw new NotFoundException("Lab report not found.");
    }

    if (report.status === "processing") {
      throw new ConflictException("Lab report extraction is already in progress.");
    }

    await this.biomarkersRepository.updateReportStatus(user.id, reportId, {
      status: "processing",
      failureCode: null,
    });

    let content: Buffer;

    try {
      content = await this.storage.read(report.storageReference);
    } catch {
      return this.failExtraction(user.id, reportId, "file_unreadable");
    }

    const parsed = await this.parser.parse(
      content,
      report.mimeType as SupportedLabReportMimeType,
    );

    if (!parsed.ok) {
      return this.failExtraction(user.id, reportId, parsed.failureCode);
    }

    if (!this.labExtractionProvider) {
      // No OPENAI_API_KEY configured — honest typed failure, never a boot crash.
      return this.failExtraction(user.id, reportId, "llm_unavailable");
    }

    let extraction: ProviderCallResult<LabExtractionOutputInput>;

    try {
      extraction = await this.labExtractionProvider.extractBiomarkers(
        { documentText: parsed.text },
        { signal: AbortSignal.timeout(LAB_EXTRACTION_TIMEOUT_MS) },
      );
    } catch {
      // Provider throw / exhausted retries / timeout. The error object is
      // intentionally discarded: nothing from it (or the document text) may
      // reach a persisted field or a log line.
      return this.failExtraction(user.id, reportId, "llm_unavailable");
    }

    // The service owns the contract parse; a schema violation is a typed
    // llm_invalid_output failure and is never retried. Intentional asymmetry:
    // structural schema violations fail the whole extraction, while
    // plausibility/safety violations (validateExtractedReadings below) drop
    // only the offending readings individually.
    const parsedOutput = labExtractionOutputSchema.safeParse(extraction.output);

    if (!parsedOutput.success) {
      return this.failExtraction(user.id, reportId, "llm_invalid_output");
    }

    const output = parsedOutput.data;

    if (!output.isLabReport) {
      return this.failExtraction(user.id, reportId, "not_a_lab_report");
    }

    const { accepted, droppedCount } = validateExtractedReadings(output);

    if (accepted.length === 0) {
      return this.failExtraction(user.id, reportId, "no_readings_extracted");
    }

    // Transactionally replaces this report's readings (soft-delete + insert),
    // so re-running extraction never appends duplicates.
    const readings = await this.biomarkersRepository.createReadingsForReport(
      user.id,
      reportId,
      accepted,
    );

    const updated = await this.biomarkersRepository.updateReportStatus(user.id, reportId, {
      status: "extracted",
      failureCode: null,
      observedAt: output.observedAt ? isoDateToTimestamp(output.observedAt) : null,
      // Dropped (invalid/unsafe) readings surface only as an addition to the
      // unmapped count — their content is discarded.
      unmappedMarkerCount: output.unmappedMarkerCount + droppedCount,
      extractedAt: new Date(),
    });

    if (!updated) {
      throw new NotFoundException("Lab report not found.");
    }

    return toLabReportDetail(updated, readings);
  }

  async updateConsent(
    auth: ClerkAuthContext,
    reportId: string,
    input: UpdateLabReportConsentInput,
  ): Promise<LabReport> {
    const user = await this.usersService.resolveFromAuth(auth);
    const existing = await this.biomarkersRepository.findActiveReportById(user.id, reportId);

    if (!existing) {
      throw new NotFoundException("Lab report not found.");
    }

    const nextConsentAt = input.coachChat
      ? (existing.coachContextConsentAt ?? new Date())
      : null;
    const updated = await this.biomarkersRepository.updateReportConsent(
      user.id,
      reportId,
      nextConsentAt,
    );

    if (!updated) {
      throw new NotFoundException("Lab report not found.");
    }

    return toLabReport(updated);
  }

  async deleteReport(auth: ClerkAuthContext, reportId: string): Promise<LabReport> {
    const user = await this.usersService.resolveFromAuth(auth);
    const existing = await this.biomarkersRepository.findActiveReportById(user.id, reportId);

    if (!existing) {
      throw new NotFoundException("Lab report not found.");
    }

    await this.storage.delete(existing.storageReference);
    const deleted = await this.biomarkersRepository.softDeleteReport(user.id, reportId);

    if (!deleted) {
      throw new NotFoundException("Lab report not found.");
    }

    return toLabReport(deleted);
  }

  private async failExtraction(
    userId: string,
    reportId: string,
    failureCode: LabReportFailureCode,
  ): Promise<LabReportDetail> {
    const failed = await this.biomarkersRepository.updateReportStatus(userId, reportId, {
      status: "failed",
      failureCode,
    });

    if (!failed) {
      throw new NotFoundException("Lab report not found.");
    }

    const readings = await this.biomarkersRepository.listReadingsByReportId(
      userId,
      reportId,
    );

    return toLabReportDetail(failed, readings);
  }
}

/**
 * Validates each LLM-extracted reading against the catalog floors and maps the
 * survivors to repository insert values.
 *
 * Per-reading checks (a failing reading is DROPPED individually, never the
 * whole batch):
 *  - validateBiomarkerReadingValue: catalog re-check (defense-in-depth behind
 *    the Zod enum), exactly-one-of value/valueText, plausibility band,
 *    unit allowlist/length — with the EN/RU unsafe-medical-language check
 *    injected over unit and valueText;
 *  - the same unsafe-language check over referenceRangeText, so no
 *    diagnosis/treatment wording can reach a persisted row.
 *
 * Structured reference/optimal ranges fail SOFT — a malformed pair (one-sided,
 * low >= high) or a bound that fails the catalog plausibility clamp nulls only
 * its own pair, the reading is kept. Numeric range fields carry no language, so
 * the unsafe-language check stays scoped to the free-text referenceRangeText.
 *
 * Dropped readings are returned only as a count; their content is discarded.
 * Per-reading observedAt falls back to the document-level observedAt.
 */
function validateExtractedReadings(output: LabExtractionOutput): {
  accepted: NewBiomarkerReadingValues[];
  droppedCount: number;
} {
  const accepted: NewBiomarkerReadingValues[] = [];
  let droppedCount = 0;

  for (const reading of output.readings) {
    const errors = validateBiomarkerReadingValue({
      biomarkerKey: reading.biomarkerKey,
      value: reading.valueNumeric,
      valueText: reading.valueText,
      unit: reading.unit,
      unsafeLanguageCheck: containsUnsafeMedicalLanguage,
    });

    const hasUnsafeReferenceRange =
      reading.referenceRangeText !== null &&
      containsUnsafeMedicalLanguage(reading.referenceRangeText);

    if (errors.length > 0 || hasUnsafeReferenceRange) {
      droppedCount++;
      continue;
    }

    const observedAtIso = reading.observedAt ?? output.observedAt;
    const entry = getBiomarkerCatalogEntry(reading.biomarkerKey as BiomarkerKey);
    const referenceRange = plausibleRangeOrNull(
      reading.referenceRangeLow,
      reading.referenceRangeHigh,
      reading.unit,
      entry,
    );
    const optimalRange = plausibleRangeOrNull(
      reading.optimalRangeLow,
      reading.optimalRangeHigh,
      reading.unit,
      entry,
    );

    accepted.push({
      biomarkerKey: reading.biomarkerKey,
      value: reading.valueNumeric === null ? null : String(reading.valueNumeric),
      valueText: reading.valueText,
      unit: reading.unit,
      referenceRangeText: reading.referenceRangeText,
      referenceRangeLow: referenceRange === null ? null : String(referenceRange.low),
      referenceRangeHigh: referenceRange === null ? null : String(referenceRange.high),
      optimalRangeLow: optimalRange === null ? null : String(optimalRange.low),
      optimalRangeHigh: optimalRange === null ? null : String(optimalRange.high),
      observedAt: observedAtIso ? isoDateToTimestamp(observedAtIso) : null,
      source: "extraction",
      confidence: reading.confidence.toFixed(3),
    });
  }

  return { accepted, droppedCount };
}

/**
 * Structural + catalog plausibility clamp for a structured range. Returns null
 * for a malformed pair (one-sided, or low >= high) — the wire schema leaves
 * these to fail soft here rather than sinking the whole report. Otherwise
 * returns the pair unchanged when both bounds sit within the catalog's
 * [typical.low/20, typical.high*20] band; returns null when either bound falls
 * outside it. When the reading's unit does not match the catalog's typicalRange
 * unit (case-insensitive trim — the same comparison used by
 * deriveBiomarkerReadingStatus / catalog lookups), the pair is accepted as-is
 * (no catalog band to compare against).
 */
function plausibleRangeOrNull(
  low: number | null,
  high: number | null,
  readingUnit: string,
  entry: ReturnType<typeof getBiomarkerCatalogEntry>,
): { low: number; high: number } | null {
  if (low === null || high === null || low >= high) {
    return null;
  }

  const typical = entry?.typicalRange ?? null;

  if (
    typical &&
    typical.unit.trim().toLowerCase() === readingUnit.trim().toLowerCase()
  ) {
    const floor = typical.low / BIOMARKER_PLAUSIBILITY_FACTOR;
    const ceil = typical.high * BIOMARKER_PLAUSIBILITY_FACTOR;

    if (low < floor || low > ceil || high < floor || high > ceil) {
      return null;
    }
  }

  return { low, high };
}
