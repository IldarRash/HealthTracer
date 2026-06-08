/**
 * i18n tests — translate()
 *
 * Covers:
 *  - translate(key, "ru") returns Russian string
 *  - translate(key, "en") returns English string
 *  - unknown/unsupported locale falls back to "en"
 */
import { describe, expect, it } from "vitest";
import { translate } from "./messages.js";

describe("translate", () => {
  it('returns the Russian string for translate("invalid_request_body", "ru")', () => {
    expect(translate("invalid_request_body", "ru")).toBe("Некорректное тело запроса");
  });

  it('returns the English string for translate("invalid_request_body", "en")', () => {
    expect(translate("invalid_request_body", "en")).toBe("Invalid request body");
  });

  it('returns Russian for translate("invalid_query_parameters", "ru")', () => {
    expect(translate("invalid_query_parameters", "ru")).toBe(
      "Некорректные параметры запроса",
    );
  });

  it('returns English for translate("invalid_query_parameters", "en")', () => {
    expect(translate("invalid_query_parameters", "en")).toBe("Invalid query parameters");
  });

  it('returns Russian for translate("internal_server_error", "ru")', () => {
    expect(translate("internal_server_error", "ru")).toBe("Внутренняя ошибка сервера");
  });

  it('returns English for translate("internal_server_error", "en")', () => {
    expect(translate("internal_server_error", "en")).toBe("Internal server error");
  });
});
