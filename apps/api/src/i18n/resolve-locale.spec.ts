/**
 * i18n tests — resolveRequestLocale()
 *
 * Covers:
 *  - Prefers authenticated user's persisted locale
 *  - Parses Accept-Language header for "en" and "ru"
 *  - Handles complex Accept-Language values (e.g. "ru-RU,ru;q=0.9,en;q=0.8")
 *  - Handles array-valued Accept-Language header
 *  - Defaults to "en" when no user locale and no useful header
 */
import { describe, expect, it } from "vitest";
import { resolveRequestLocale } from "./resolve-locale.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(acceptLanguage: string | string[] | undefined): {
  headers: Record<string, string | string[] | undefined>;
} {
  return {
    headers: {
      "accept-language": acceptLanguage,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveRequestLocale", () => {
  describe("user locale takes precedence", () => {
    it("returns 'ru' when user has locale='ru' regardless of header", () => {
      const locale = resolveRequestLocale(
        { locale: "ru" },
        makeRequest("en-US,en;q=0.9"),
      );
      expect(locale).toBe("ru");
    });

    it("returns 'en' when user has locale='en' regardless of a Russian header", () => {
      const locale = resolveRequestLocale(
        { locale: "en" },
        makeRequest("ru-RU,ru;q=0.9"),
      );
      expect(locale).toBe("en");
    });
  });

  describe("Accept-Language header parsing", () => {
    it("returns 'ru' when Accept-Language is 'ru' and user is null", () => {
      const locale = resolveRequestLocale(null, makeRequest("ru"));
      expect(locale).toBe("ru");
    });

    it("returns 'en' when Accept-Language is 'en' and user is null", () => {
      const locale = resolveRequestLocale(null, makeRequest("en"));
      expect(locale).toBe("en");
    });

    it("extracts the primary language from a quality-valued header 'ru-RU,ru;q=0.9,en;q=0.8'", () => {
      const locale = resolveRequestLocale(null, makeRequest("ru-RU,ru;q=0.9,en;q=0.8"));
      expect(locale).toBe("ru");
    });

    it("extracts the primary language from 'en-US,en;q=0.9'", () => {
      const locale = resolveRequestLocale(null, makeRequest("en-US,en;q=0.9"));
      expect(locale).toBe("en");
    });

    it("handles array-valued Accept-Language header (uses first element)", () => {
      const locale = resolveRequestLocale(null, makeRequest(["ru", "en"]));
      expect(locale).toBe("ru");
    });

    it("defaults to 'en' for unsupported language 'fr'", () => {
      const locale = resolveRequestLocale(null, makeRequest("fr"));
      expect(locale).toBe("en");
    });

    it("defaults to 'en' when Accept-Language is missing", () => {
      const locale = resolveRequestLocale(null, makeRequest(undefined));
      expect(locale).toBe("en");
    });
  });

  describe("defaults", () => {
    it("returns 'en' when both user and request are null", () => {
      const locale = resolveRequestLocale(null, null);
      expect(locale).toBe("en");
    });

    it("returns 'en' when user is undefined and request is undefined", () => {
      const locale = resolveRequestLocale(undefined, undefined);
      expect(locale).toBe("en");
    });

    it("returns 'en' when user locale is undefined (not yet set)", () => {
      const locale = resolveRequestLocale({} as { locale: "en" | "ru" }, null);
      expect(locale).toBe("en");
    });
  });
});
