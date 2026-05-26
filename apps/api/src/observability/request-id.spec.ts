import { describe, expect, it } from "vitest";
import {
  createRequestId,
  normalizeRequestId,
  resolveRequestId,
} from "./request-id.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("createRequestId", () => {
  it("generates UUID request ids", () => {
    expect(createRequestId()).toMatch(UUID_PATTERN);
  });
});

describe("normalizeRequestId", () => {
  it("accepts valid incoming request ids", () => {
    const incoming = "11111111-1111-4111-8111-111111111111";
    expect(normalizeRequestId(incoming)).toBe(incoming);
  });

  it("rejects ids that are too short", () => {
    expect(normalizeRequestId("short")).toBeNull();
  });

  it("rejects unsafe request ids", () => {
    expect(normalizeRequestId("bad id with spaces")).toBeNull();
    expect(normalizeRequestId("token=secret&user=1")).toBeNull();
  });
});

describe("resolveRequestId", () => {
  it("accepts a client-provided request id", () => {
    expect(resolveRequestId("client-request-123")).toBe("client-request-123");
  });

  it("generates a request id when the header is missing", () => {
    expect(resolveRequestId(undefined)).toMatch(UUID_PATTERN);
  });

  it("generates a request id when the header is invalid", () => {
    expect(resolveRequestId("bad id with spaces")).toMatch(UUID_PATTERN);
  });

  it("uses the first value when the header is an array", () => {
    expect(resolveRequestId(["client-request-123", "ignored"])).toBe(
      "client-request-123",
    );
  });
});
