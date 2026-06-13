import { biomarkerReadings, labReports } from "@health/db";
import type { LabReportStatus } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, getTableColumns, isNotNull, isNull, or, sql } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

export interface NewLabReportValues {
  id: string;
  userId: string;
  title: string;
  storageReference: string;
  mimeType: string;
  fileSizeBytes: number;
  consentVersion: string;
  storeParseConsentAt: Date;
  coachContextConsentAt: Date | null;
}

export interface LabReportStatusUpdate {
  status: LabReportStatus;
  failureCode: string | null;
  observedAt?: Date | null;
  unmappedMarkerCount?: number;
  extractedAt?: Date | null;
}

export interface NewBiomarkerReadingValues {
  biomarkerKey: string;
  /** Drizzle numeric columns are written as strings to avoid float drift. */
  value: string | null;
  valueText: string | null;
  unit: string;
  referenceRangeText: string | null;
  /** Structured ranges in the reading's own unit (drizzle-numeric strings). */
  referenceRangeLow: string | null;
  referenceRangeHigh: string | null;
  optimalRangeLow: string | null;
  optimalRangeHigh: string | null;
  observedAt: Date | null;
  source: "extraction" | "manual";
  confidence: string | null;
}

export interface BiomarkerReadingUpdate {
  value: string | null;
  valueText: string | null;
  unit: string;
  referenceRangeLow: string | null;
  referenceRangeHigh: string | null;
  optimalRangeLow: string | null;
  optimalRangeHigh: string | null;
  observedAt: Date | null;
  userEdited: boolean;
  confidence: string | null;
}

@Injectable()
export class BiomarkersRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  // ── Lab reports ────────────────────────────────────────────────────────────

  async createReport(values: NewLabReportValues) {
    const [report] = await this.db.insert(labReports).values(values).returning();

    if (!report) {
      throw new Error("Failed to create lab report.");
    }

    return report;
  }

  async listActiveReportsByUserId(userId: string) {
    return this.db
      .select()
      .from(labReports)
      .where(and(eq(labReports.userId, userId), isNull(labReports.deletedAt)))
      .orderBy(desc(labReports.uploadedAt));
  }

  async findActiveReportById(userId: string, reportId: string) {
    const [report] = await this.db
      .select()
      .from(labReports)
      .where(
        and(
          eq(labReports.id, reportId),
          eq(labReports.userId, userId),
          isNull(labReports.deletedAt),
        ),
      )
      .limit(1);

    return report ?? null;
  }

  async updateReportStatus(userId: string, reportId: string, values: LabReportStatusUpdate) {
    const [report] = await this.db
      .update(labReports)
      .set({
        status: values.status,
        failureCode: values.failureCode,
        ...(values.observedAt !== undefined ? { observedAt: values.observedAt } : {}),
        ...(values.unmappedMarkerCount !== undefined
          ? { unmappedMarkerCount: values.unmappedMarkerCount }
          : {}),
        ...(values.extractedAt !== undefined ? { extractedAt: values.extractedAt } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(labReports.id, reportId),
          eq(labReports.userId, userId),
          isNull(labReports.deletedAt),
        ),
      )
      .returning();

    return report ?? null;
  }

  async updateReportConsent(
    userId: string,
    reportId: string,
    coachContextConsentAt: Date | null,
  ) {
    const [report] = await this.db
      .update(labReports)
      .set({ coachContextConsentAt, updatedAt: new Date() })
      .where(
        and(
          eq(labReports.id, reportId),
          eq(labReports.userId, userId),
          isNull(labReports.deletedAt),
        ),
      )
      .returning();

    return report ?? null;
  }

  /** Soft-deletes the report and all of its readings in one transaction. */
  async softDeleteReport(userId: string, reportId: string) {
    const now = new Date();

    return this.db.transaction(async (tx) => {
      await tx
        .update(biomarkerReadings)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(biomarkerReadings.labReportId, reportId),
            eq(biomarkerReadings.userId, userId),
            isNull(biomarkerReadings.deletedAt),
          ),
        );

      const [report] = await tx
        .update(labReports)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(labReports.id, reportId),
            eq(labReports.userId, userId),
            isNull(labReports.deletedAt),
          ),
        )
        .returning();

      return report ?? null;
    });
  }

  // ── Biomarker readings ─────────────────────────────────────────────────────

  /**
   * Replaces the readings of a report in one transaction: prior readings are
   * soft-deleted, the new extraction batch is inserted. Re-running extraction
   * therefore never appends duplicates.
   */
  async createReadingsForReport(
    userId: string,
    labReportId: string,
    values: NewBiomarkerReadingValues[],
  ) {
    const now = new Date();

    return this.db.transaction(async (tx) => {
      await tx
        .update(biomarkerReadings)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(biomarkerReadings.labReportId, labReportId),
            eq(biomarkerReadings.userId, userId),
            isNull(biomarkerReadings.deletedAt),
          ),
        );

      if (values.length === 0) {
        return [];
      }

      return tx
        .insert(biomarkerReadings)
        .values(values.map((reading) => ({ ...reading, userId, labReportId })))
        .returning();
    });
  }

  async createManualReading(userId: string, values: NewBiomarkerReadingValues) {
    const [reading] = await this.db
      .insert(biomarkerReadings)
      .values({ ...values, userId, labReportId: null })
      .returning();

    if (!reading) {
      throw new Error("Failed to create biomarker reading.");
    }

    return reading;
  }

  async listActiveReadingsByUserId(userId: string) {
    return this.db
      .select()
      .from(biomarkerReadings)
      .where(and(eq(biomarkerReadings.userId, userId), isNull(biomarkerReadings.deletedAt)))
      .orderBy(
        sql`${biomarkerReadings.observedAt} desc nulls last`,
        desc(biomarkerReadings.createdAt),
      );
  }

  async listReadingsByReportId(userId: string, labReportId: string) {
    return this.db
      .select()
      .from(biomarkerReadings)
      .where(
        and(
          eq(biomarkerReadings.labReportId, labReportId),
          eq(biomarkerReadings.userId, userId),
          isNull(biomarkerReadings.deletedAt),
        ),
      )
      .orderBy(asc(biomarkerReadings.biomarkerKey), asc(biomarkerReadings.createdAt));
  }

  async findActiveReadingById(userId: string, readingId: string) {
    const [reading] = await this.db
      .select()
      .from(biomarkerReadings)
      .where(
        and(
          eq(biomarkerReadings.id, readingId),
          eq(biomarkerReadings.userId, userId),
          isNull(biomarkerReadings.deletedAt),
        ),
      )
      .limit(1);

    return reading ?? null;
  }

  async updateReading(userId: string, readingId: string, values: BiomarkerReadingUpdate) {
    const [reading] = await this.db
      .update(biomarkerReadings)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(
          eq(biomarkerReadings.id, readingId),
          eq(biomarkerReadings.userId, userId),
          isNull(biomarkerReadings.deletedAt),
        ),
      )
      .returning();

    return reading ?? null;
  }

  async softDeleteReading(userId: string, readingId: string) {
    const now = new Date();
    const [reading] = await this.db
      .update(biomarkerReadings)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(biomarkerReadings.id, readingId),
          eq(biomarkerReadings.userId, userId),
          isNull(biomarkerReadings.deletedAt),
        ),
      )
      .returning();

    return reading ?? null;
  }

  async listReadingsByMarkerKey(userId: string, biomarkerKey: string, limit: number) {
    return this.db
      .select()
      .from(biomarkerReadings)
      .where(
        and(
          eq(biomarkerReadings.userId, userId),
          eq(biomarkerReadings.biomarkerKey, biomarkerKey),
          isNull(biomarkerReadings.deletedAt),
        ),
      )
      .orderBy(
        sql`${biomarkerReadings.observedAt} desc nulls last`,
        desc(biomarkerReadings.createdAt),
      )
      .limit(limit);
  }

  // ── Coach-context / proposal-evidence eligibility ──────────────────────────
  //
  // A reading may reach the coach (chat context or proposal evidence) only when
  // the user deliberately put it there: manual readings are always eligible;
  // extracted readings require the owning lab report to be active (not
  // soft-deleted) with per-report coach-chat consent (`coachContextConsentAt`).

  /**
   * One row per marker — the most recent ACTIVE + CONTEXT-ELIGIBLE reading
   * (DISTINCT ON over the eligibility-filtered set, so a consented older
   * reading wins over a newer non-consented one).
   */
  async listContextEligibleLatestReadingPerMarker(userId: string) {
    return this.db
      .selectDistinctOn([biomarkerReadings.biomarkerKey], getTableColumns(biomarkerReadings))
      .from(biomarkerReadings)
      .leftJoin(labReports, eq(biomarkerReadings.labReportId, labReports.id))
      .where(
        and(
          eq(biomarkerReadings.userId, userId),
          isNull(biomarkerReadings.deletedAt),
          this.contextEligibleCondition(),
        ),
      )
      .orderBy(
        asc(biomarkerReadings.biomarkerKey),
        sql`${biomarkerReadings.observedAt} desc nulls last`,
        desc(biomarkerReadings.createdAt),
      );
  }

  /** The same eligibility rule, for verifying a single proposal evidence ref. */
  async findContextEligibleReadingById(userId: string, readingId: string) {
    const [reading] = await this.db
      .select(getTableColumns(biomarkerReadings))
      .from(biomarkerReadings)
      .leftJoin(labReports, eq(biomarkerReadings.labReportId, labReports.id))
      .where(
        and(
          eq(biomarkerReadings.id, readingId),
          eq(biomarkerReadings.userId, userId),
          isNull(biomarkerReadings.deletedAt),
          this.contextEligibleCondition(),
        ),
      )
      .limit(1);

    return reading ?? null;
  }

  private contextEligibleCondition() {
    return or(
      eq(biomarkerReadings.source, "manual"),
      and(isNull(labReports.deletedAt), isNotNull(labReports.coachContextConsentAt)),
    );
  }

  /** One row per marker — the most recent active reading (DISTINCT ON). */
  async listLatestReadingPerMarker(userId: string) {
    return this.db
      .selectDistinctOn([biomarkerReadings.biomarkerKey])
      .from(biomarkerReadings)
      .where(and(eq(biomarkerReadings.userId, userId), isNull(biomarkerReadings.deletedAt)))
      .orderBy(
        asc(biomarkerReadings.biomarkerKey),
        sql`${biomarkerReadings.observedAt} desc nulls last`,
        desc(biomarkerReadings.createdAt),
      );
  }

  /** Active reading count per marker for the dashboard. */
  async countActiveReadingsByMarker(userId: string) {
    return this.db
      .select({
        biomarkerKey: biomarkerReadings.biomarkerKey,
        readingCount: sql<number>`count(*)::int`,
      })
      .from(biomarkerReadings)
      .where(and(eq(biomarkerReadings.userId, userId), isNull(biomarkerReadings.deletedAt)))
      .groupBy(biomarkerReadings.biomarkerKey);
  }
}
