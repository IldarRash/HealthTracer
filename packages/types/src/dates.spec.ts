import { describe, expect, it } from "vitest";
import { isoDateSchema, isCalendarValidIsoDate } from "./dates.js";

describe("isoDateSchema", () => {
  it("accepts valid calendar dates including leap days", () => {
    expect(isoDateSchema.parse("2026-05-22")).toBe("2026-05-22");
    expect(isoDateSchema.parse("2024-02-29")).toBe("2024-02-29");
  });

  it("rejects malformed and calendar-invalid dates", () => {
    expect(() => isoDateSchema.parse("05/22/2026")).toThrow();
    expect(() => isoDateSchema.parse("2026-99-99")).toThrow();
    expect(() => isoDateSchema.parse("2026-02-30")).toThrow();
    expect(() => isoDateSchema.parse("2023-02-29")).toThrow();
  });

  it("validates calendar dates through the helper", () => {
    expect(isCalendarValidIsoDate("2026-05-22")).toBe(true);
    expect(isCalendarValidIsoDate("2026-99-99")).toBe(false);
  });
});
