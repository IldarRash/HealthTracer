import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyApiRequest } from "./api-proxy-handler.js";
import { REQUEST_ID_HEADER } from "./request-correlation.js";

const requestId = "11111111-1111-4111-8111-111111111111";

async function readBody(body: ReadableStream<Uint8Array> | ArrayBuffer): Promise<ArrayBuffer> {
  if (body instanceof ArrayBuffer) return body;
  const chunks: Uint8Array[] = [];
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

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
    expect(JSON.parse(new TextDecoder().decode(await readBody(result.body)))).toEqual({
      statusCode: 502,
      message: "Upstream API is unavailable.",
    });
  });

  it("passes a 401 upstream response through with the JSON body intact", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const upstreamBody = JSON.stringify({
      message: "Bearer token is required.",
      error: "Unauthorized",
      statusCode: 401,
    });
    const fetchMock = vi.fn(async () => {
      return new Response(upstreamBody, {
        status: 401,
        headers: {
          "content-type": "application/json; charset=utf-8",
          [REQUEST_ID_HEADER]: requestId,
        },
      });
    });

    const result = await proxyApiRequest({
      method: "GET",
      pathSegments: ["users", "me", "state"],
      search: "",
      headers: new Headers(),
      body: null,
      apiBaseUrl: "http://localhost:3000",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.status).toBe(401);
    expect(result.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(JSON.parse(new TextDecoder().decode(await readBody(result.body)))).toEqual({
      message: "Bearer token is required.",
      error: "Unauthorized",
      statusCode: 401,
    });
  });

  it("passes a 500 upstream response through with the JSON body intact", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const upstreamBody = JSON.stringify({ statusCode: 500, message: "Internal Server Error" });
    const fetchMock = vi.fn(async () => {
      return new Response(upstreamBody, {
        status: 500,
        headers: {
          "content-type": "application/json",
          [REQUEST_ID_HEADER]: requestId,
        },
      });
    });

    const result = await proxyApiRequest({
      method: "GET",
      pathSegments: ["some", "endpoint"],
      search: "",
      headers: new Headers(),
      body: null,
      apiBaseUrl: "http://localhost:3000",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.status).toBe(500);
    expect(result.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(new TextDecoder().decode(await readBody(result.body)))).toEqual({
      statusCode: 500,
      message: "Internal Server Error",
    });
  });

  it("converts an opaque redirect (status=0) to a 502 instead of throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Simulate an opaque redirect: fetch with redirect:'manual' on some runtimes
    // returns a response with status=0 and an unreadable body.
    const fetchMock = vi.fn(async () => {
      // Construct a minimal opaque-redirect-like response with status=0.
      // The Response constructor rejects status=0, so we bypass it for the mock.
      return {
        status: 0,
        headers: new Headers(),
        body: null,
      } as unknown as Response;
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
    expect(JSON.parse(new TextDecoder().decode(await readBody(result.body)))).toEqual({
      statusCode: 502,
      message: "Upstream API is unavailable.",
    });
  });

  it("passes an SSE upstream body through as a ReadableStream without buffering", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const frame1 = new TextEncoder().encode("data: {\"stage\":\"routing\"}\n\n");
    const frame2 = new TextEncoder().encode("data: {\"stage\":\"done\"}\n\n");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(frame1);
        controller.enqueue(frame2);
        controller.close();
      },
    });

    const fetchMock = vi.fn(async () => {
      return new Response(stream, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          [REQUEST_ID_HEADER]: requestId,
        },
      });
    });

    const result = await proxyApiRequest({
      method: "POST",
      pathSegments: ["chat", "threads", "abc", "messages", "stream"],
      search: "",
      headers: new Headers({ [REQUEST_ID_HEADER]: requestId }),
      body: new TextEncoder().encode("{}").buffer,
      apiBaseUrl: "http://localhost:3000",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("text/event-stream");
    // body must be a ReadableStream, not a buffered ArrayBuffer
    expect(result.body).toBeInstanceOf(ReadableStream);

    // Read chunks individually to verify they arrive as separate enqueued chunks
    const reader = (result.body as ReadableStream<Uint8Array>).getReader();
    const chunk1 = await reader.read();
    const chunk2 = await reader.read();
    const end = await reader.read();

    expect(chunk1.done).toBe(false);
    expect(new TextDecoder().decode(chunk1.value)).toBe("data: {\"stage\":\"routing\"}\n\n");
    expect(chunk2.done).toBe(false);
    expect(new TextDecoder().decode(chunk2.value)).toBe("data: {\"stage\":\"done\"}\n\n");
    expect(end.done).toBe(true);
  });

  it("passes the upstream cache-control header through and never invents one", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => {
      return new Response(new Uint8Array([0xff, 0xd8]), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "cache-control": "private, no-store",
          [REQUEST_ID_HEADER]: requestId,
        },
      });
    });

    const result = await proxyApiRequest({
      method: "GET",
      pathSegments: ["chat", "attachments", "abc", "content"],
      search: "",
      headers: new Headers({ [REQUEST_ID_HEADER]: requestId }),
      body: null,
      apiBaseUrl: "http://localhost:3000",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");

    // No upstream cache-control → none on the proxied response either.
    const fetchMockNoCache = vi.fn(async () => {
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json", [REQUEST_ID_HEADER]: requestId },
      });
    });

    const resultNoCache = await proxyApiRequest({
      method: "GET",
      pathSegments: ["users", "me"],
      search: "",
      headers: new Headers({ [REQUEST_ID_HEADER]: requestId }),
      body: null,
      apiBaseUrl: "http://localhost:3000",
      fetchImpl: fetchMockNoCache as typeof fetch,
    });

    expect(resultNoCache.headers.get("cache-control")).toBeNull();
  });

  it("passes a non-streaming JSON response through as a ReadableStream byte-identical", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const upstreamBody = JSON.stringify({ id: "abc", status: "ok" });

    const fetchMock = vi.fn(async () => {
      return new Response(upstreamBody, {
        status: 200,
        headers: {
          "content-type": "application/json",
          [REQUEST_ID_HEADER]: requestId,
        },
      });
    });

    const result = await proxyApiRequest({
      method: "GET",
      pathSegments: ["chat", "threads", "abc"],
      search: "",
      headers: new Headers({ [REQUEST_ID_HEADER]: requestId }),
      body: null,
      apiBaseUrl: "http://localhost:3000",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(new TextDecoder().decode(await readBody(result.body)))).toEqual({
      id: "abc",
      status: "ok",
    });
  });
});
