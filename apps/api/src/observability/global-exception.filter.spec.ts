import {
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  categorizeException,
  GlobalExceptionFilter,
} from "./global-exception.filter.js";
import { parseBody, parseQuery } from "../common/zod.js";
import { z } from "zod";

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

  describe("Accept-Language localization for parseBody/parseQuery validation errors", () => {
    function makeHost(acceptLanguage: string | undefined, logSpy?: ReturnType<typeof vi.spyOn>) {
      void logSpy;
      const json = vi.fn();
      const status = vi.fn(() => ({ json }));
      const request = {
        method: "POST",
        originalUrl: "/test",
        headers: acceptLanguage ? { "accept-language": acceptLanguage } : {},
      };
      const host = {
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => ({ status }),
        }),
      };
      return { host, status, json };
    }

    it("returns Russian top-level message with statusCode and issues preserved when Accept-Language is ru", () => {
      const logSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
      const filter = new GlobalExceptionFilter();
      const schema = z.object({ name: z.string() });

      let thrownException: BadRequestException | undefined;
      try {
        parseBody(schema, { name: 123 });
      } catch (err) {
        thrownException = err as BadRequestException;
      }

      expect(thrownException).toBeInstanceOf(BadRequestException);

      const { host, status, json } = makeHost("ru");
      filter.catch(thrownException, host as never);

      expect(status).toHaveBeenCalledWith(400);
      const responseBody = json.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(responseBody["message"]).toBe("Некорректное тело запроса");
      expect(responseBody["statusCode"]).toBe(400);
      expect(responseBody["code"]).toBe("invalid_request_body");
      expect(Array.isArray(responseBody["issues"])).toBe(true);

      logSpy.mockRestore();
    });

    it("returns English top-level message when Accept-Language is en", () => {
      const logSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
      const filter = new GlobalExceptionFilter();
      const schema = z.object({ name: z.string() });

      let thrownException: BadRequestException | undefined;
      try {
        parseBody(schema, { name: 123 });
      } catch (err) {
        thrownException = err as BadRequestException;
      }

      const { host, status, json } = makeHost("en");
      filter.catch(thrownException, host as never);

      expect(status).toHaveBeenCalledWith(400);
      const responseBody = json.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(responseBody["message"]).toBe("Invalid request body");
      expect(responseBody["statusCode"]).toBe(400);
      expect(responseBody["code"]).toBe("invalid_request_body");
      expect(Array.isArray(responseBody["issues"])).toBe(true);

      logSpy.mockRestore();
    });

    it("returns English top-level message when no Accept-Language header is present", () => {
      const logSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
      const filter = new GlobalExceptionFilter();
      const schema = z.object({ name: z.string() });

      let thrownException: BadRequestException | undefined;
      try {
        parseBody(schema, { name: 123 });
      } catch (err) {
        thrownException = err as BadRequestException;
      }

      const { host, status, json } = makeHost(undefined);
      filter.catch(thrownException, host as never);

      expect(status).toHaveBeenCalledWith(400);
      const responseBody = json.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(responseBody["message"]).toBe("Invalid request body");

      logSpy.mockRestore();
    });

    it("returns Russian message for parseQuery validation errors with Accept-Language ru", () => {
      const logSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
      const filter = new GlobalExceptionFilter();
      const schema = z.object({ page: z.number() });

      let thrownException: BadRequestException | undefined;
      try {
        parseQuery(schema, { page: "not-a-number" });
      } catch (err) {
        thrownException = err as BadRequestException;
      }

      const { host, status, json } = makeHost("ru");
      filter.catch(thrownException, host as never);

      expect(status).toHaveBeenCalledWith(400);
      const responseBody = json.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(responseBody["message"]).toBe("Некорректные параметры запроса");
      expect(responseBody["code"]).toBe("invalid_query_parameters");
      expect(Array.isArray(responseBody["issues"])).toBe(true);

      logSpy.mockRestore();
    });

    it("does not re-translate plain-string HttpException responses without a code", () => {
      const logSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
      const filter = new GlobalExceptionFilter();
      const exception = new BadRequestException("Only pending proposals can be decided.");
      const { host, status, json } = makeHost("ru");

      filter.catch(exception, host as never);

      expect(status).toHaveBeenCalledWith(400);
      const responseBody = json.mock.calls[0]?.[0] as string | Record<string, unknown>;
      // Plain string response from NestJS — returned as-is (not re-translated)
      const message = typeof responseBody === "string"
        ? responseBody
        : (responseBody as Record<string, unknown>)["message"];
      expect(message).toBe("Only pending proposals can be decided.");

      logSpy.mockRestore();
    });
  });
});
