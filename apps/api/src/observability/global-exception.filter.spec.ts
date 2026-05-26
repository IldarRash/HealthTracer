import {
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  categorizeException,
  GlobalExceptionFilter,
} from "./global-exception.filter.js";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

describe("categorizeException", () => {
  it("categorizes auth failures without exposing bearer tokens", () => {
    const result = categorizeException(
      new UnauthorizedException("Bearer token is required."),
    );

    expect(result).toEqual({
      statusCode: 401,
      category: "auth_jwks",
      clientMessage: "Bearer token is required.",
    });
  });

  it("categorizes database failures from error messages", () => {
    const result = categorizeException(new Error("postgres connection terminated"));

    expect(result).toEqual({
      statusCode: 500,
      category: "database",
      clientMessage: "Internal server error",
    });
  });

  it("does not include request bodies or authorization headers", () => {
    const result = categorizeException(
      new Error("Authorization: Bearer secret-token should never be logged"),
    );

    expect(result.category).toBe("unexpected");
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("categorizes client validation failures", () => {
    const result = categorizeException(
      new BadRequestException("Only pending proposals can be decided."),
    );

    expect(result).toEqual({
      statusCode: 400,
      category: "validation",
      clientMessage: "Only pending proposals can be decided.",
    });
  });

  it("categorizes AI provider failures", () => {
    const result = categorizeException(new Error("OpenAI rate limit exceeded"));

    expect(result).toEqual({
      statusCode: 500,
      category: "ai_provider",
      clientMessage: "Internal server error",
    });
  });

  it("categorizes document storage failures", () => {
    const result = categorizeException(new Error("ENOENT: document storage path missing"));

    expect(result).toEqual({
      statusCode: 500,
      category: "document_storage",
      clientMessage: "Internal server error",
    });
  });
});

describe("GlobalExceptionFilter", () => {
  it("logs sanitized paths without leaking auth context on 500 errors", () => {
    process.env.NODE_ENV = "production";
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const filter = new GlobalExceptionFilter();
    const request = {
      method: "GET",
      originalUrl: "/documents/5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81?token=secret",
      requestId: "req-500",
    };
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ status }),
      }),
    };

    filter.catch(new Error("postgres connection terminated"), host as never);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: "Internal server error",
    });

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({
      event: "http.exception",
      requestId: "req-500",
      method: "GET",
      path: "/documents/:id",
      statusCode: 500,
      errorCategory: "database",
      errorName: "Error",
    });
    expect(payload).not.toHaveProperty("stack");
    expect(JSON.stringify(payload)).not.toContain("secret");
    expect(JSON.stringify(payload)).not.toContain("postgres connection terminated");

    logSpy.mockRestore();
  });

  it("includes stack traces in non-production for 500 errors", () => {
    process.env.NODE_ENV = "development";
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const filter = new GlobalExceptionFilter();
    const request = {
      method: "POST",
      originalUrl: "/health",
      requestId: "req-dev",
    };
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ status }),
      }),
    };
    const error = new Error("postgres connection terminated");

    filter.catch(error, host as never);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.stack).toBe(error.stack);

    logSpy.mockRestore();
  });
});
