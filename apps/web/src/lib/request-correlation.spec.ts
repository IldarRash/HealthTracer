import { describe, expect, it } from "vitest";
import {
  createRequestId,
  getApiErrorMessage,
  normalizeRequestId,
  resolveRequestId,
} from "./request-correlation.js";

describe("request correlation", () => {
  it("generates UUID request ids", () => {
    expect(createRequestId()).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i,
    );
  });

  it("accepts valid incoming request ids", () => {
    const incoming = "11111111-1111-4111-8111-111111111111";
    expect(normalizeRequestId(incoming)).toBe(incoming);
    expect(resolveRequestId(incoming)).toBe(incoming);
  });

  it("rejects unsafe request ids", () => {
    expect(normalizeRequestId("bad id with spaces")).toBeNull();
    expect(resolveRequestId("bad id with spaces")).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i,
    );
  });

  it("formats support-friendly API error messages", () => {
    expect(
      getApiErrorMessage({
        error: "Weekly progress summary not found.",
        requestId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe(
      "Weekly progress summary not found. (Request ID: 11111111-1111-4111-8111-111111111111)",
    );
  });

  it("returns the raw error when no request id is available", () => {
    expect(getApiErrorMessage({ error: "Upstream API is unavailable." })).toBe(
      "Upstream API is unavailable.",
    );
  });
});
