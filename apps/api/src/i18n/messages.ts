import type { UserLocale } from "@health/types";

export type MessageKey =
  | "invalid_request_body"
  | "invalid_query_parameters"
  | "internal_server_error";

const MESSAGE_KEYS = new Set<string>([
  "invalid_request_body",
  "invalid_query_parameters",
  "internal_server_error",
]);

export function isMessageKey(value: unknown): value is MessageKey {
  return typeof value === "string" && MESSAGE_KEYS.has(value);
}

const MESSAGES: Record<MessageKey, Record<UserLocale, string>> = {
  invalid_request_body: {
    en: "Invalid request body",
    ru: "Некорректное тело запроса",
  },
  invalid_query_parameters: {
    en: "Invalid query parameters",
    ru: "Некорректные параметры запроса",
  },
  internal_server_error: {
    en: "Internal server error",
    ru: "Внутренняя ошибка сервера",
  },
};

/**
 * Returns the translated message for the given key and locale.
 * Falls back to English when the locale is not found or the key is missing.
 */
export function translate(key: MessageKey, locale: UserLocale): string {
  return MESSAGES[key]?.[locale] ?? MESSAGES[key]?.["en"] ?? key;
}
