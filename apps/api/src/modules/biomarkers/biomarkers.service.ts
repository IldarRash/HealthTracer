import { containsUnsafeMedicalLanguage } from "@health/ai";
import type {
  AiBiomarkerContextSummary,
  BiomarkerContextItem,
  BiomarkerHistoryResponse,
  BiomarkerReading,
  BiomarkersDashboardArea,
  BiomarkersDashboardResponse,
  CreateBiomarkerReadingInput,
  UpdateBiomarkerReadingInput,
} from "@health/types";
import {
  aiBiomarkerContextSummarySchema,
  BIOMARKER_AREA_ORDER,
  BIOMARKER_CATALOG,
  biomarkerKeySchema,
  getBiomarkerCatalogEntry,
  MAX_BIOMARKER_CONTEXT_ITEMS,
  validateBiomarkerReadingValue,
} from "@health/types";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { UsersService } from "../users/users.service.js";
import { BiomarkersRepository } from "./biomarkers.repository.js";
import { isoDateToTimestamp, toBiomarkerReading } from "./lab-report.mapper.js";

const HISTORY_READING_LIMIT = 50;

@Injectable()
export class BiomarkersService {
  constructor(
    private readonly biomarkersRepository: BiomarkersRepository,
    private readonly usersService: UsersService,
  ) {}

  async getDashboard(auth: ClerkAuthContext): Promise<BiomarkersDashboardResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const [latestRows, countRows] = await Promise.all([
      this.biomarkersRepository.listLatestReadingPerMarker(user.id),
      this.biomarkersRepository.countActiveReadingsByMarker(user.id),
    ]);

    const latestByKey = new Map(
      latestRows.map((row) => [row.biomarkerKey, toBiomarkerReading(row)]),
    );
    const countByKey = new Map(
      countRows.map((row) => [row.biomarkerKey, row.readingCount]),
    );

    const areas: BiomarkersDashboardArea[] = [];

    for (const area of BIOMARKER_AREA_ORDER) {
      const markers = BIOMARKER_CATALOG.filter(
        (entry) => entry.area === area && latestByKey.has(entry.key),
      ).map((entry) => ({
        key: entry.key,
        displayLabel: entry.displayLabel,
        canonicalUnit: entry.canonicalUnit,
        typicalRange: entry.typicalRange,
        latestReading: latestByKey.get(entry.key) ?? null,
        readingCount: countByKey.get(entry.key) ?? 0,
      }));

      if (markers.length > 0) {
        areas.push({ area, markers });
      }
    }

    return { areas, generatedAt: new Date().toISOString() };
  }

  async getHistory(
    auth: ClerkAuthContext,
    biomarkerKey: string,
  ): Promise<BiomarkerHistoryResponse> {
    const parsedKey = biomarkerKeySchema.safeParse(biomarkerKey);

    if (!parsedKey.success) {
      throw new NotFoundException("Unknown biomarker key.");
    }

    const entry = getBiomarkerCatalogEntry(parsedKey.data);

    if (!entry) {
      throw new NotFoundException("Unknown biomarker key.");
    }

    const user = await this.usersService.resolveFromAuth(auth);
    const rows = await this.biomarkersRepository.listReadingsByMarkerKey(
      user.id,
      parsedKey.data,
      HISTORY_READING_LIMIT,
    );

    return {
      biomarkerKey: entry.key,
      area: entry.area,
      displayLabel: entry.displayLabel,
      canonicalUnit: entry.canonicalUnit,
      typicalRange: entry.typicalRange,
      readings: rows.map(toBiomarkerReading),
    };
  }

  /**
   * The coach-chat biomarker context slice: the latest context-eligible reading
   * per marker (manual readings always; extracted readings only from active
   * reports with coach-chat consent), capped and ordered by recency.
   *
   * Contains ONLY structured catalog-labeled data — no reference ranges and no
   * document-derived free text (range framing invites diagnosis-flavored
   * language from the model).
   */
  async buildBiomarkerContextSummary(userId: string): Promise<AiBiomarkerContextSummary> {
    const rows = await this.biomarkersRepository.listContextEligibleLatestReadingPerMarker(
      userId,
    );

    const items: BiomarkerContextItem[] = [];

    for (const row of rows) {
      const parsedKey = biomarkerKeySchema.safeParse(row.biomarkerKey);
      const entry = parsedKey.success ? getBiomarkerCatalogEntry(parsedKey.data) : undefined;

      // Fail closed: rows whose key is no longer in the catalog never reach the coach.
      if (!parsedKey.success || !entry) {
        continue;
      }

      items.push({
        biomarkerKey: entry.key,
        displayLabel: entry.displayLabel,
        value: row.value === null ? null : Number(row.value),
        valueText: row.valueText,
        unit: row.unit,
        observedAt: row.observedAt ? row.observedAt.toISOString().slice(0, 10) : null,
        source: row.source === "manual" ? "manual" : "extraction",
      });
    }

    items.sort(compareBiomarkerContextItemsByRecency);

    return aiBiomarkerContextSummarySchema.parse({
      items: items.slice(0, MAX_BIOMARKER_CONTEXT_ITEMS),
      generatedAt: new Date().toISOString(),
    });
  }

  async addManualReading(
    auth: ClerkAuthContext,
    input: CreateBiomarkerReadingInput,
  ): Promise<BiomarkerReading> {
    this.assertReadingValueValid({
      biomarkerKey: input.biomarkerKey,
      value: input.value ?? null,
      valueText: input.valueText ?? null,
      unit: input.unit,
    });

    const user = await this.usersService.resolveFromAuth(auth);
    const reading = await this.biomarkersRepository.createManualReading(user.id, {
      biomarkerKey: input.biomarkerKey,
      value: input.value !== undefined ? String(input.value) : null,
      valueText: input.valueText ?? null,
      unit: input.unit.trim(),
      referenceRangeText: null,
      // Manual readings carry no extracted ranges; the user enters a single value.
      referenceRangeLow: null,
      referenceRangeHigh: null,
      optimalRangeLow: null,
      optimalRangeHigh: null,
      observedAt: input.observedAt ? isoDateToTimestamp(input.observedAt) : null,
      source: "manual",
      confidence: null,
    });

    return toBiomarkerReading(reading);
  }

  async updateReading(
    auth: ClerkAuthContext,
    readingId: string,
    input: UpdateBiomarkerReadingInput,
  ): Promise<BiomarkerReading> {
    const user = await this.usersService.resolveFromAuth(auth);
    const existing = await this.biomarkersRepository.findActiveReadingById(
      user.id,
      readingId,
    );

    if (!existing) {
      throw new NotFoundException("Biomarker reading not found.");
    }

    // value/valueText are mutually exclusive: providing one clears the other.
    let nextValue: number | null;
    let nextValueText: string | null;

    if (input.value !== undefined) {
      nextValue = input.value;
      nextValueText = null;
    } else if (input.valueText !== undefined) {
      nextValue = null;
      nextValueText = input.valueText;
    } else {
      nextValue = existing.value === null ? null : Number(existing.value);
      nextValueText = existing.valueText;
    }

    const nextUnit = input.unit ?? existing.unit;

    this.assertReadingValueValid({
      biomarkerKey: existing.biomarkerKey,
      value: nextValue,
      valueText: nextValueText,
      unit: nextUnit,
    });

    const nextObservedAt =
      input.observedAt === undefined
        ? existing.observedAt
        : input.observedAt === null
          ? null
          : isoDateToTimestamp(input.observedAt);

    // Stored ranges are only valid in the reading's original unit. Editing the
    // unit invalidates them, so clear all four; otherwise carry them through.
    const unitChanged =
      input.unit !== undefined &&
      input.unit.trim().toLowerCase() !== existing.unit.trim().toLowerCase();

    const updated = await this.biomarkersRepository.updateReading(user.id, readingId, {
      value: nextValue === null ? null : String(nextValue),
      valueText: nextValueText,
      unit: nextUnit.trim(),
      referenceRangeLow: unitChanged ? null : existing.referenceRangeLow,
      referenceRangeHigh: unitChanged ? null : existing.referenceRangeHigh,
      optimalRangeLow: unitChanged ? null : existing.optimalRangeLow,
      optimalRangeHigh: unitChanged ? null : existing.optimalRangeHigh,
      observedAt: nextObservedAt,
      userEdited: true,
      confidence: null,
    });

    if (!updated) {
      throw new NotFoundException("Biomarker reading not found.");
    }

    return toBiomarkerReading(updated);
  }

  async deleteReading(auth: ClerkAuthContext, readingId: string): Promise<BiomarkerReading> {
    const user = await this.usersService.resolveFromAuth(auth);
    const deleted = await this.biomarkersRepository.softDeleteReading(user.id, readingId);

    if (!deleted) {
      throw new NotFoundException("Biomarker reading not found.");
    }

    return toBiomarkerReading(deleted);
  }

  private assertReadingValueValid(candidate: {
    biomarkerKey: string;
    value: number | null;
    valueText: string | null;
    unit: string;
  }): void {
    const errors = validateBiomarkerReadingValue({
      ...candidate,
      unsafeLanguageCheck: containsUnsafeMedicalLanguage,
    });

    if (errors.length > 0) {
      throw new BadRequestException({
        message: "Invalid biomarker reading.",
        code: "invalid_biomarker_reading",
        errors,
      });
    }
  }
}

/** Most recently observed first; undated readings sort last; key as tiebreak. */
function compareBiomarkerContextItemsByRecency(
  a: BiomarkerContextItem,
  b: BiomarkerContextItem,
): number {
  if (a.observedAt !== b.observedAt) {
    if (a.observedAt === null) {
      return 1;
    }

    if (b.observedAt === null) {
      return -1;
    }

    return b.observedAt.localeCompare(a.observedAt);
  }

  return a.biomarkerKey.localeCompare(b.biomarkerKey);
}
