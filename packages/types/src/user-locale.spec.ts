/**
 * i18n tests — userLocaleSchema and updateCurrentUserSchema
 *
 * Covers:
 *  - userLocaleSchema accepts "en" and "ru"; rejects "fr", "", "EN"
 *  - updateCurrentUserSchema accepts { locale: "ru" } and rejects { locale: "de" }
 */
import { describe, expect, it } from "vitest";
import { userLocaleSchema, updateCurrentUserSchema } from "./index.js";

describe("userLocaleSchema", () => {
  it('accepts "en"', () => {
    expect(userLocaleSchema.parse("en")).toBe("en");
  });

  it('accepts "ru"', () => {
    expect(userLocaleSchema.parse("ru")).toBe("ru");
  });

  it('rejects "fr"', () => {
    expect(() => userLocaleSchema.parse("fr")).toThrow();
  });

  it('rejects empty string ""', () => {
    expect(() => userLocaleSchema.parse("")).toThrow();
  });

  it('rejects uppercase "EN"', () => {
    expect(() => userLocaleSchema.parse("EN")).toThrow();
  });
});

describe("updateCurrentUserSchema — locale field", () => {
  it('accepts { locale: "ru" }', () => {
    const result = updateCurrentUserSchema.parse({ locale: "ru" });
    expect(result.locale).toBe("ru");
  });

  it('accepts { locale: "en" }', () => {
    const result = updateCurrentUserSchema.parse({ locale: "en" });
    expect(result.locale).toBe("en");
  });

  it("accepts omitted locale (field is optional)", () => {
    const result = updateCurrentUserSchema.parse({});
    expect(result.locale).toBeUndefined();
  });

  it('rejects { locale: "de" }', () => {
    expect(() => updateCurrentUserSchema.parse({ locale: "de" })).toThrow();
  });

  it('rejects { locale: "RU" }', () => {
    expect(() => updateCurrentUserSchema.parse({ locale: "RU" })).toThrow();
  });
});
