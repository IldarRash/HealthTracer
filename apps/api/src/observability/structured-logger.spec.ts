import { describe, expect, it, vi } from "vitest";
import { writeStructuredLog } from "./structured-logger.js";

describe("writeStructuredLog", () => {
  it("writes JSON logs to stdout for non-error levels", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    writeStructuredLog({
      level: "info",
      message: "HTTP request completed",
      event: "http.request",
      requestId: "req-123",
      method: "GET",
      path: "/health",
      statusCode: 200,
      durationMs: 12,
    });

    expect(logSpy).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));

    expect(payload).toMatchObject({
      service: "health-api",
      level: "info",
      message: "HTTP request completed",
      requestId: "req-123",
      method: "GET",
      path: "/health",
      statusCode: 200,
      durationMs: 12,
      event: "http.request",
    });
    expect(payload.timestamp).toEqual(expect.any(String));

    logSpy.mockRestore();
  });

  it("writes JSON logs to stderr for error levels", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    writeStructuredLog({
      level: "error",
      message: "Unhandled server error",
      event: "http.exception",
      stack: "Error: boom",
    });

    expect(errorSpy).toHaveBeenCalledOnce();

    errorSpy.mockRestore();
  });

  it("omits fields that were not provided in the log entry", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    writeStructuredLog({
      level: "info",
      message: "HTTP request completed",
      event: "http.request",
      requestId: "req-123",
      method: "GET",
      path: "/health",
      statusCode: 200,
    });

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload).not.toHaveProperty("stack");
    expect(payload).not.toHaveProperty("integrations");
    expect(JSON.stringify(payload)).not.toMatch(/authorization|bearer|cookie/i);

    logSpy.mockRestore();
  });
});
