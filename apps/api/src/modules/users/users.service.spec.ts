/**
 * i18n tests — user locale persistence (mapper layer)
 *
 * Tests the toUser mapper which drives locale persistence behavior.
 * This avoids NestJS/DI imports (which don't resolve in the vitest workspace
 * environment) and tests at the pure mapper boundary.
 *
 * Covers:
 *  - toUser maps locale "ru" row → User.locale "ru"
 *  - toUser maps locale "en" row → User.locale "en"
 *  - toUser defaults to "en" for any unrecognized locale value (DB default "en")
 *  - toUser does NOT clobber displayName or timezone when mapping locale
 */
import { describe, expect, it } from "vitest";
import { toUser } from "./user.mapper.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUserRow(overrides: Partial<{
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
  locale: string;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  clerkUserId: string;
}> = {}) {
  return {
    id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
    clerkUserId: "clerk_001",
    email: "test@example.com",
    displayName: "Test User",
    timezone: "UTC",
    locale: "en",
    onboardingCompletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("toUser — locale mapping", () => {
  it('maps locale "ru" to User.locale "ru"', () => {
    const user = toUser(makeUserRow({ locale: "ru" }));
    expect(user.locale).toBe("ru");
  });

  it('maps locale "en" to User.locale "en"', () => {
    const user = toUser(makeUserRow({ locale: "en" }));
    expect(user.locale).toBe("en");
  });

  it("defaults to 'en' for an unrecognized locale value (mirrors DB default)", () => {
    // The DB default is "en"; if an unexpected value somehow appeared it must
    // still return "en" to keep the type safe.
    const user = toUser(makeUserRow({ locale: "fr" }));
    expect(user.locale).toBe("en");
  });

  it("does NOT lose displayName when locale is 'ru'", () => {
    const user = toUser(makeUserRow({ locale: "ru", displayName: "Иван" }));
    expect(user.locale).toBe("ru");
    expect(user.displayName).toBe("Иван");
  });

  it("does NOT lose timezone when locale is 'ru'", () => {
    const user = toUser(makeUserRow({ locale: "ru", timezone: "Europe/Moscow" }));
    expect(user.locale).toBe("ru");
    expect(user.timezone).toBe("Europe/Moscow");
  });
});
