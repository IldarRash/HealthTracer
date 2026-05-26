import { BadRequestException, type ExecutionContext } from "@nestjs/common";
import { lastValueFrom, of, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { RequestLoggingInterceptor } from "./request-logging.interceptor.js";

function createContext(request: Record<string, unknown>, response: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ExecutionContext;
}

describe("RequestLoggingInterceptor", () => {
  it("logs request metadata without query strings or request bodies", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const interceptor = new RequestLoggingInterceptor();
    const request = {
      method: "POST",
      originalUrl: "/chat/threads/5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81?prompt=secret",
      requestId: "req-log-1",
    };
    const response = { statusCode: 201 };

    await lastValueFrom(
      interceptor.intercept(createContext(request, response), {
        handle: () => of({ content: "private chat body" }),
      }),
    );

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({
      event: "http.request",
      requestId: "req-log-1",
      method: "POST",
      path: "/chat/threads/:id",
      statusCode: 201,
    });
    expect(JSON.stringify(payload)).not.toMatch(/secret|private chat body|authorization/i);

    logSpy.mockRestore();
  });

  it("uses a dedicated liveness message for /health", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const interceptor = new RequestLoggingInterceptor();
    const request = {
      method: "GET",
      originalUrl: "/health",
      requestId: "req-health",
    };
    const response = { statusCode: 200 };

    await lastValueFrom(
      interceptor.intercept(createContext(request, response), {
        handle: () => of(undefined),
      }),
    );

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.message).toBe("Liveness probe completed");
    expect(payload.path).toBe("/health");

    logSpy.mockRestore();
  });

  it("logs warn level for handled client errors", async () => {
    const warnSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const interceptor = new RequestLoggingInterceptor();
    const request = {
      method: "POST",
      originalUrl: "/proposals/abc/decision",
      requestId: "req-warn",
    };
    const response = { statusCode: 200 };

    await expect(
      lastValueFrom(
        interceptor.intercept(createContext(request, response), {
          handle: () =>
            throwError(() => new BadRequestException("Only pending proposals can be decided.")),
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const payload = JSON.parse(String(warnSpy.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({
      level: "warn",
      statusCode: 400,
      requestId: "req-warn",
    });
    expect(JSON.stringify(payload)).not.toContain("Only pending proposals");

    warnSpy.mockRestore();
  });
});
