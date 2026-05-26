import { afterEach, describe, expect, it, vi } from "vitest";
import { logApiProxyRequest, logWebStartupDiagnostics } from "./server-log.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("server log helpers", () => {
  it("logs web startup diagnostics without secret values", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_example");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logWebStartupDiagnostics();

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({
      service: "health-web",
      event: "startup",
      nodeEnv: "test",
      apiBaseUrlConfigured: true,
      clerkPublishableKeyConfigured: true,
    });
    expect(JSON.stringify(payload)).not.toContain("pk_test_example");
    expect(JSON.stringify(payload)).not.toContain("localhost:3000");
  });

  it("logs api proxy metadata without cookies, tokens, or bodies", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logApiProxyRequest({
      requestId: "11111111-1111-4111-8111-111111111111",
      method: "POST",
      path: "/api-proxy/chat/threads/abc/messages",
      statusCode: 200,
      durationMs: 15,
    });

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload).toMatchObject({
      service: "health-web",
      event: "api_proxy",
      requestId: "11111111-1111-4111-8111-111111111111",
      method: "POST",
      path: "/api-proxy/chat/threads/abc/messages",
      statusCode: 200,
      durationMs: 15,
    });
    expect(JSON.stringify(payload)).not.toMatch(/Bearer|cookie|authorization|hello/i);
  });

  it("sanitizes query strings and uuid segments in logged proxy paths", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const documentId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";

    logApiProxyRequest({
      requestId: "11111111-1111-4111-8111-111111111111",
      method: "GET",
      path: `/api-proxy/documents/search?q=secret`,
      statusCode: 200,
      durationMs: 8,
    });

    logApiProxyRequest({
      requestId: "11111111-1111-4111-8111-111111111111",
      method: "GET",
      path: `/api-proxy/documents/${documentId}`,
      statusCode: 200,
      durationMs: 12,
    });

    const searchPayload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    const documentPayload = JSON.parse(String(logSpy.mock.calls[1]?.[0]));

    expect(searchPayload.path).toBe("/api-proxy/documents/search");
    expect(JSON.stringify(searchPayload)).not.toContain("secret");
    expect(JSON.stringify(searchPayload)).not.toContain("q=");

    expect(documentPayload.path).toBe("/api-proxy/documents/:id");
    expect(JSON.stringify(documentPayload)).not.toContain(documentId);
  });

  it("writes proxy failures to stderr", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logApiProxyRequest({
      requestId: "11111111-1111-4111-8111-111111111111",
      method: "GET",
      path: "/api-proxy/users/me",
      statusCode: 502,
      durationMs: 4,
    });

    expect(errorSpy).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(errorSpy.mock.calls[0]?.[0]));
    expect(payload.level).toBe("error");
  });
});
