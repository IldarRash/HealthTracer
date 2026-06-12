import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { BiomarkersService } from "./biomarkers.service.js";

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

const usersServiceMock = { resolveFromAuth: async () => user };

function createService(repository: Record<string, unknown>) {
  return new BiomarkersService(repository as never, usersServiceMock as never);
}

function readingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d",
    userId: user.id,
    labReportId: null,
    biomarkerKey: "fasting_glucose",
    value: "92.0000",
    valueText: null,
    unit: "mg/dL",
    referenceRangeText: null,
    referenceRangeLow: null,
    referenceRangeHigh: null,
    optimalRangeLow: null,
    optimalRangeHigh: null,
    observedAt: new Date("2026-05-20T00:00:00.000Z"),
    source: "manual",
    confidence: null,
    userEdited: false,
    deletedAt: null,
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    updatedAt: new Date("2026-06-01T12:00:00.000Z"),
    ...overrides,
  };
}

describe("BiomarkersService", () => {
  describe("getDashboard", () => {
    it("groups latest readings by catalog area in display order with catalog metadata", async () => {
      const service = createService({
        listLatestReadingPerMarker: async () => [
          readingRow({ id: "11111111-1111-4111-8111-111111111111", biomarkerKey: "alt", value: "30.0000", unit: "U/L" }),
          readingRow({ id: "22222222-2222-4222-8222-222222222222", biomarkerKey: "hba1c", value: "5.2000", unit: "%" }),
          readingRow({ id: "33333333-3333-4333-8333-333333333333", biomarkerKey: "fasting_glucose" }),
        ],
        countActiveReadingsByMarker: async () => [
          { biomarkerKey: "alt", readingCount: 1 },
          { biomarkerKey: "hba1c", readingCount: 3 },
          { biomarkerKey: "fasting_glucose", readingCount: 2 },
        ],
      });

      const dashboard = await service.getDashboard(auth);

      // Only areas with readings appear, ordered metabolic → liver.
      expect(dashboard.areas.map((area) => area.area)).toEqual(["metabolic", "liver"]);

      const metabolic = dashboard.areas[0]!;
      // Catalog order within the area: fasting_glucose before hba1c.
      expect(metabolic.markers.map((marker) => marker.key)).toEqual([
        "fasting_glucose",
        "hba1c",
      ]);

      const hba1c = metabolic.markers[1]!;
      expect(hba1c.displayLabel).toBe("HbA1c");
      expect(hba1c.canonicalUnit).toBe("%");
      expect(hba1c.typicalRange).toEqual({ low: 4.0, high: 5.6, unit: "%" });
      expect(hba1c.latestReading?.value).toBe(5.2);
      expect(hba1c.readingCount).toBe(3);
    });

    it("materializes the latest reading's nested ranges in the reading's own unit", async () => {
      const service = createService({
        listLatestReadingPerMarker: async () => [
          readingRow({
            biomarkerKey: "fasting_glucose",
            unit: "mg/dL",
            referenceRangeLow: "70.0000",
            referenceRangeHigh: "99.0000",
            optimalRangeLow: "75.0000",
            optimalRangeHigh: "90.0000",
          }),
        ],
        countActiveReadingsByMarker: async () => [
          { biomarkerKey: "fasting_glucose", readingCount: 1 },
        ],
      });

      const dashboard = await service.getDashboard(auth);
      const latest = dashboard.areas[0]?.markers[0]?.latestReading;

      expect(latest?.referenceRange).toEqual({ low: 70, high: 99, unit: "mg/dL" });
      expect(latest?.optimalRange).toEqual({ low: 75, high: 90, unit: "mg/dL" });
    });

    it("returns no areas when the user has no readings", async () => {
      const service = createService({
        listLatestReadingPerMarker: async () => [],
        countActiveReadingsByMarker: async () => [],
      });

      const dashboard = await service.getDashboard(auth);

      expect(dashboard.areas).toEqual([]);
      expect(dashboard.generatedAt).toBeTruthy();
    });
  });

  describe("getHistory", () => {
    it("throws NotFound for an unknown biomarker key", async () => {
      const service = createService({});

      await expect(service.getHistory(auth, "not_a_marker")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("returns catalog metadata and mapped readings for a known key", async () => {
      const capturedArgs: unknown[] = [];
      const service = createService({
        listReadingsByMarkerKey: async (userId: string, key: string, limit: number) => {
          capturedArgs.push(userId, key, limit);
          return [readingRow()];
        },
      });

      const history = await service.getHistory(auth, "fasting_glucose");

      expect(capturedArgs).toEqual([user.id, "fasting_glucose", 50]);
      expect(history.area).toBe("metabolic");
      expect(history.displayLabel).toBe("Fasting glucose");
      expect(history.typicalRange).toEqual({ low: 70, high: 99, unit: "mg/dL" });
      expect(history.readings).toHaveLength(1);
      expect(history.readings[0]?.value).toBe(92);
    });

    it("exposes each history reading's nested ranges in that reading's unit", async () => {
      const service = createService({
        listReadingsByMarkerKey: async () => [
          readingRow({
            unit: "mg/dL",
            referenceRangeLow: "70.0000",
            referenceRangeHigh: "99.0000",
            optimalRangeLow: "75.0000",
            optimalRangeHigh: "90.0000",
          }),
        ],
      });

      const history = await service.getHistory(auth, "fasting_glucose");

      expect(history.readings[0]?.referenceRange).toEqual({ low: 70, high: 99, unit: "mg/dL" });
      expect(history.readings[0]?.optimalRange).toEqual({ low: 75, high: 90, unit: "mg/dL" });
    });
  });

  describe("buildBiomarkerContextSummary", () => {
    const KEYS_FOR_CAP_TEST = [
      "fasting_glucose",
      "hba1c",
      "fasting_insulin",
      "total_cholesterol",
      "ldl_cholesterol",
      "hdl_cholesterol",
      "triglycerides",
      "apob",
      "lipoprotein_a",
      "testosterone_total",
      "testosterone_free",
      "shbg",
      "estradiol",
      "cortisol_am",
      "tsh",
      "free_t4",
      "free_t3",
      "dhea_s",
      "vitamin_d",
      "vitamin_b12",
      "folate",
      "ferritin",
      "iron",
      "tibc",
      "transferrin_saturation",
      "magnesium",
      "hs_crp",
      "homocysteine",
      "uric_acid",
      "hemoglobin",
      "hematocrit",
      "rbc",
    ] as const;

    it("delegates eligibility to the consent-aware repository query scoped to the user", async () => {
      const capturedUserIds: string[] = [];
      const service = createService({
        listContextEligibleLatestReadingPerMarker: async (userId: string) => {
          capturedUserIds.push(userId);
          return [];
        },
      });

      const summary = await service.buildBiomarkerContextSummary(user.id);

      expect(capturedUserIds).toEqual([user.id]);
      expect(summary.items).toEqual([]);
      expect(summary.generatedAt).toBeTruthy();
    });

    it("maps eligible readings to catalog-labeled items ordered by recency (nulls last)", async () => {
      const service = createService({
        listContextEligibleLatestReadingPerMarker: async () => [
          readingRow({
            id: "11111111-1111-4111-8111-111111111111",
            biomarkerKey: "ferritin",
            value: "45.0000",
            unit: "ng/mL",
            observedAt: null,
            source: "extraction",
            labReportId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
            confidence: "0.820",
          }),
          readingRow({
            id: "22222222-2222-4222-8222-222222222222",
            biomarkerKey: "vitamin_d",
            value: "38.0000",
            unit: "ng/mL",
            observedAt: new Date("2026-05-25T00:00:00.000Z"),
          }),
          readingRow({
            id: "33333333-3333-4333-8333-333333333333",
            biomarkerKey: "fasting_glucose",
            observedAt: new Date("2026-05-10T00:00:00.000Z"),
          }),
        ],
      });

      const summary = await service.buildBiomarkerContextSummary(user.id);

      expect(summary.items.map((item) => item.biomarkerKey)).toEqual([
        "vitamin_d",
        "fasting_glucose",
        "ferritin",
      ]);
      expect(summary.items[0]).toEqual({
        biomarkerKey: "vitamin_d",
        displayLabel: "Vitamin D (25-OH)",
        value: 38,
        valueText: null,
        unit: "ng/mL",
        observedAt: "2026-05-25",
        source: "manual",
      });
      expect(summary.items[2]?.source).toBe("extraction");
      expect(summary.items[2]?.observedAt).toBeNull();
    });

    it("contains only structured catalog data — no reference ranges, ids, or confidence", async () => {
      const service = createService({
        listContextEligibleLatestReadingPerMarker: async () => [
          readingRow({ referenceRangeText: "70-99 mg/dL", confidence: "0.900" }),
        ],
      });

      const summary = await service.buildBiomarkerContextSummary(user.id);

      const serialized = JSON.stringify(summary);
      expect(serialized).not.toMatch(/referenceRange|typicalRange|confidence|labReportId/i);
      expect(summary.items[0]).not.toHaveProperty("id");
    });

    it("fails closed on readings whose key is no longer in the catalog", async () => {
      const service = createService({
        listContextEligibleLatestReadingPerMarker: async () => [
          readingRow({ biomarkerKey: "retired_marker" }),
          readingRow({ id: "44444444-4444-4444-8444-444444444444", biomarkerKey: "hba1c", value: "5.2000", unit: "%" }),
        ],
      });

      const summary = await service.buildBiomarkerContextSummary(user.id);

      expect(summary.items.map((item) => item.biomarkerKey)).toEqual(["hba1c"]);
    });

    it("caps the summary at 30 items", async () => {
      const service = createService({
        listContextEligibleLatestReadingPerMarker: async () =>
          KEYS_FOR_CAP_TEST.map((biomarkerKey, index) =>
            readingRow({
              id: `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`,
              biomarkerKey,
              observedAt: new Date(Date.UTC(2026, 0, 1 + index)),
            }),
          ),
      });

      const summary = await service.buildBiomarkerContextSummary(user.id);

      expect(KEYS_FOR_CAP_TEST.length).toBe(32);
      expect(summary.items).toHaveLength(30);
      // Capping keeps the most recently observed markers.
      expect(summary.items[0]?.biomarkerKey).toBe("rbc");
      expect(summary.items.map((item) => item.biomarkerKey)).not.toContain("fasting_glucose");
    });
  });

  describe("addManualReading", () => {
    it("creates a manual reading with source=manual and null confidence", async () => {
      const captured: Array<Record<string, unknown>> = [];
      const service = createService({
        createManualReading: async (_userId: string, values: Record<string, unknown>) => {
          captured.push(values);
          return readingRow({ ...values, observedAt: values.observedAt ?? null });
        },
      });

      const reading = await service.addManualReading(auth, {
        biomarkerKey: "fasting_glucose",
        value: 92,
        unit: "mg/dL",
        observedAt: "2026-05-20",
      });

      expect(captured[0]).toMatchObject({
        biomarkerKey: "fasting_glucose",
        value: "92",
        valueText: null,
        unit: "mg/dL",
        source: "manual",
        confidence: null,
        // Manual readings carry no extracted ranges.
        referenceRangeLow: null,
        referenceRangeHigh: null,
        optimalRangeLow: null,
        optimalRangeHigh: null,
      });
      expect(captured[0]?.observedAt).toEqual(new Date("2026-05-20T00:00:00.000Z"));
      expect(reading.source).toBe("manual");
      expect(reading.confidence).toBeNull();
    });

    it("rejects a value outside the plausibility band", async () => {
      let created = false;
      const service = createService({
        createManualReading: async () => {
          created = true;
          return readingRow();
        },
      });

      await expect(
        service.addManualReading(auth, {
          biomarkerKey: "fasting_glucose",
          value: 99_999,
          unit: "mg/dL",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(created).toBe(false);
    });

    it("rejects unsafe medical language in the unit field", async () => {
      let created = false;
      const service = createService({
        createManualReading: async () => {
          created = true;
          return readingRow();
        },
      });

      await expect(
        service.addManualReading(auth, {
          biomarkerKey: "fasting_glucose",
          value: 92,
          unit: "diagnosis",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(created).toBe(false);
    });
  });

  describe("updateReading", () => {
    it("sets userEdited, nulls confidence, and carries ranges through when the unit is unchanged", async () => {
      const captured: Array<Record<string, unknown>> = [];
      const existing = readingRow({
        labReportId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
        source: "extraction",
        confidence: "0.820",
        referenceRangeLow: "70.0000",
        referenceRangeHigh: "99.0000",
        optimalRangeLow: "75.0000",
        optimalRangeHigh: "90.0000",
      });
      const service = createService({
        findActiveReadingById: async () => existing,
        updateReading: async (
          _userId: string,
          _readingId: string,
          values: Record<string, unknown>,
        ) => {
          captured.push(values);
          return { ...existing, ...values };
        },
      });

      const updated = await service.updateReading(auth, existing.id as string, { value: 95 });

      expect(captured[0]).toMatchObject({
        value: "95",
        valueText: null,
        unit: "mg/dL",
        userEdited: true,
        confidence: null,
        // Same unit → stored ranges are preserved.
        referenceRangeLow: "70.0000",
        referenceRangeHigh: "99.0000",
        optimalRangeLow: "75.0000",
        optimalRangeHigh: "90.0000",
      });
      expect(updated.userEdited).toBe(true);
      expect(updated.confidence).toBeNull();
    });

    it("clears all four stored ranges when the unit is edited to a different value", async () => {
      const captured: Array<Record<string, unknown>> = [];
      const existing = readingRow({
        unit: "mg/dL",
        referenceRangeLow: "70.0000",
        referenceRangeHigh: "99.0000",
        optimalRangeLow: "75.0000",
        optimalRangeHigh: "90.0000",
      });
      const service = createService({
        findActiveReadingById: async () => existing,
        updateReading: async (
          _userId: string,
          _readingId: string,
          values: Record<string, unknown>,
        ) => {
          captured.push(values);
          return { ...existing, ...values };
        },
      });

      // mmol/L is an accepted glucose unit but differs from the stored mg/dL,
      // invalidating ranges captured in the original unit.
      await service.updateReading(auth, existing.id as string, { value: 5.1, unit: "mmol/L" });

      expect(captured[0]).toMatchObject({
        unit: "mmol/L",
        referenceRangeLow: null,
        referenceRangeHigh: null,
        optimalRangeLow: null,
        optimalRangeHigh: null,
      });
    });

    it("rejects an edit that violates the plausibility band", async () => {
      let updated = false;
      const service = createService({
        findActiveReadingById: async () => readingRow(),
        updateReading: async () => {
          updated = true;
          return readingRow();
        },
      });

      await expect(
        service.updateReading(auth, readingRow().id as string, { value: 99_999 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(updated).toBe(false);
    });

    it("throws NotFound for a reading the user does not own", async () => {
      const service = createService({ findActiveReadingById: async () => null });

      await expect(
        service.updateReading(auth, readingRow().id as string, { value: 95 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("deleteReading", () => {
    it("soft-deletes the reading", async () => {
      const captured: unknown[] = [];
      const service = createService({
        softDeleteReading: async (userId: string, readingId: string) => {
          captured.push(userId, readingId);
          return readingRow({ deletedAt: new Date() });
        },
      });

      await service.deleteReading(auth, readingRow().id as string);

      expect(captured).toEqual([user.id, readingRow().id]);
    });

    it("throws NotFound when the reading does not exist", async () => {
      const service = createService({ softDeleteReading: async () => null });

      await expect(
        service.deleteReading(auth, readingRow().id as string),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
