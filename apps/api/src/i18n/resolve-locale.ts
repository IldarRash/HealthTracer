import type { UserLocale } from "@health/types";
import type { User } from "@health/types";

type MinimalRequest = {
  headers: Record<string, string | string[] | undefined>;
};

/**
 * Resolve the effective locale for a request in order of precedence:
 *  1. Authenticated user's persisted locale (authoritative)
 *  2. Accept-Language header — only "en" and "ru" are supported
 *  3. Default: "en"
 *
 * Used by zod parse helpers and the global exception filter to localize
 * generic user-facing error messages. Domain-specific messages are NOT
 * translated here — only the generic top-level strings.
 */
export function resolveRequestLocale(
  user: Pick<User, "locale"> | null | undefined,
  request: MinimalRequest | null | undefined,
): UserLocale {
  // 1. Authenticated user's persisted locale takes precedence.
  if (user?.locale === "ru" || user?.locale === "en") {
    return user.locale;
  }

  // 2. Accept-Language header (forwarded by the web api-proxy).
  const acceptLanguage = request?.headers?.["accept-language"];
  const headerValue =
    typeof acceptLanguage === "string"
      ? acceptLanguage
      : Array.isArray(acceptLanguage)
        ? acceptLanguage[0]
        : undefined;

  if (headerValue) {
    const primary = headerValue.split(",")[0]?.trim().toLowerCase().split("-")[0] ?? "";

    if (primary === "ru") {
      return "ru";
    }

    if (primary === "en") {
      return "en";
    }
  }

  // 3. Default.
  return "en";
}
