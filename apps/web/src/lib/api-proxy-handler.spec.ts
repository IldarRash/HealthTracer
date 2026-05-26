import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyApiRequest } from "./api-proxy-handler.js";
import { REQUEST_ID_HEADER } from "./request-correlation.js";

const requestId = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api proxy handler", () => {
  it("forwards auth and request id without logging request bodies", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.headers).toBeInstanceOf(Headers);
      const headers = init?.headers as Headers;

      expect(headers.get("authorization")).toBe("Bearer test-token");
      expect(headers.get(REQUEST_ID_HEADER)).toBe(requestId);
      expect(init?.body).toBeInstanceOf(ArrayBuffer);

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          [REQUEST_ID_HEADER]: requestId,
        },
      });
    });

    const body = new TextEncoder().encode(JSON.stringify({ content: "hello" })).buffer;
    const headers = new Headers({
      authorization: "Bearer test-token",
      "content-type": "application/json",
      [REQUEST_ID_HEADER]: requestId,
    });

    const result = await proxyApiRequest({
      method: "POST",
      pathSegments: ["chat", "threads", "abc", "messages"],
      search: "",
      headers,
      body,
      apiBaseUrl: "http://localhost:3000",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/chat/threads/abc/messages",
      expect.any(Object),
    );
    expect(result.status).toBe(200);
    expect(result.requestId).toBe(requestId);

    const logged = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(logged).toMatchObject({
      service: "health-web",
      event: "api_proxy",
      requestId,
      method: "POST",
      path: "/api-proxy/chat/threads/abc/messages",
      statusCode: 200,
    });
    expect(JSON.stringify(logged)).not.toMatch(/Bearer|hello|authorization/i);
  });

  it("forwards query strings upstream but omits them from logs", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const documentId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(
        `http://localhost:3000/documents/${documentId}?q=secret&filter=active`,
      );

      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json", [REQUEST_ID_HEADER]: requestId },
      });
    });

    await proxyApiRequest({
      method: "GET",
      pathSegments: ["documents", documentId],
      search: "?q=secret&filter=active",
      headers: new Headers({ [REQUEST_ID_HEADER]: requestId }),
      body: null,
      apiBaseUrl: "http://localhost:3000",
      fetchImpl: fetchMock as typeof fetch,
    });

    const logged = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(logged.path).toBe("/api-proxy/documents/:id");
    expect(JSON.stringify(logged)).not.toContain("secret");
    expect(JSON.stringify(logged)).not.toContain("q=");
  });

  it("sanitizes search query paths in logs while preserving upstream query", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("http://localhost:3000/documents/search?q=secret");

      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json", [REQUEST_ID_HEADER]: requestId },
      });
    });

    await proxyApiRequest({
      method: "GET",
      pathSegments: ["documents", "search"],
      search: "?q=secret",
      headers: new Headers({ [REQUEST_ID_HEADER]: requestId }),
      body: null,
      apiBaseUrl: "http://localhost:3000",
      fetchImpl: fetchMock as typeof fetch,
    });

    const logged = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(logged.path).toBe("/api-proxy/documents/search");
    expect(JSON.stringify(logged)).not.toContain("secret");
    expect(JSON.stringify(logged)).not.toContain("q=");
  });

  it("does not forward cookie headers to upstream", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Headers;

      expect(headers.get("authorization")).toBe("Bearer test-token");
      expect(headers.get("cookie")).toBeNull();

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json", [REQUEST_ID_HEADER]: requestId },
      });
    });

    await proxyApiRequest({
      method: "GET",
      pathSegments: ["users", "me"],
      search: "",
      headers: new Headers({
        authorization: "Bearer test-token",
        cookie: "session=super-secret",
        [REQUEST_ID_HEADER]: requestId,
      }),
      body: null,
      apiBaseUrl: "http://localhost:3000",
      fetchImpl: fetchMock as typeof fetch,
    });
  });

  it("returns a safe 502 response when upstream is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => {
      throw new Error("connection refused");
    });

    const result = await proxyApiRequest({
      method: "GET",
      pathSegments: ["users", "me"],
      search: "",
      headers: new Headers({ [REQUEST_ID_HEADER]: requestId }),
      body: null,
      apiBaseUrl: "http://localhost:3000",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.status).toBe(502);
    expect(result.requestId).toBe(requestId);
    expect(JSON.parse(new TextDecoder().decode(result.body))).toEqual({
      statusCode: 502,
      message: "Upstream API is unavailable.",
    });
  });
});
