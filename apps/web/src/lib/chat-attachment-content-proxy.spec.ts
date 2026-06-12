import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyChatAttachmentContent } from "./chat-attachment-content-proxy.js";
import { REQUEST_ID_HEADER } from "./request-correlation.js";

const requestId = "22222222-2222-4222-8222-222222222222";
const attachmentId = "a1000001-0000-4000-8000-000000000001";

async function readBody(body: ReadableStream<Uint8Array> | ArrayBuffer): Promise<Uint8Array> {
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
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
  return result;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("proxyChatAttachmentContent", () => {
  it("forwards the minted session token as a bearer and streams the binary body back", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    // JPEG magic bytes — a genuinely binary (non-UTF-8) payload.
    const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`http://localhost:3000/chat/attachments/${attachmentId}/content`);
      const headers = init?.headers as Headers;
      expect(headers.get("authorization")).toBe("Bearer minted-session-token");
      expect(headers.get(REQUEST_ID_HEADER)).toBe(requestId);
      expect(headers.get("cookie")).toBeNull();

      return new Response(imageBytes, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "cache-control": "private, no-store",
          [REQUEST_ID_HEADER]: requestId,
        },
      });
    });

    const result = await proxyChatAttachmentContent({
      attachmentId,
      incomingHeaders: new Headers({ [REQUEST_ID_HEADER]: requestId }),
      sessionToken: "minted-session-token",
      apiBaseUrl: "http://localhost:3000",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("image/jpeg");
    // The API's private caching directive must pass through — no public caching.
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(await readBody(result.body)).toEqual(imageBytes);
  });

  it("returns 401 without calling upstream when there is no session token", async () => {
    const fetchMock = vi.fn();

    const result = await proxyChatAttachmentContent({
      attachmentId,
      incomingHeaders: new Headers(),
      sessionToken: null,
      apiBaseUrl: "http://localhost:3000",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe(401);
    expect(result.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(new TextDecoder().decode(await readBody(result.body)))).toEqual({
      statusCode: 401,
      message: "Authentication required.",
    });
  });

  it("passes an upstream 403 (ownership rejection) through untouched", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const upstreamBody = JSON.stringify({ statusCode: 403, message: "Forbidden" });
    const fetchMock = vi.fn(async () => {
      return new Response(upstreamBody, {
        status: 403,
        headers: { "content-type": "application/json", [REQUEST_ID_HEADER]: requestId },
      });
    });

    const result = await proxyChatAttachmentContent({
      attachmentId,
      incomingHeaders: new Headers({ [REQUEST_ID_HEADER]: requestId }),
      sessionToken: "minted-session-token",
      apiBaseUrl: "http://localhost:3000",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.status).toBe(403);
    expect(JSON.parse(new TextDecoder().decode(await readBody(result.body)))).toEqual({
      statusCode: 403,
      message: "Forbidden",
    });
  });

  it("passes an upstream 404 (unknown or expired attachment) through untouched", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ statusCode: 404, message: "Not Found" }), {
        status: 404,
        headers: { "content-type": "application/json", [REQUEST_ID_HEADER]: requestId },
      });
    });

    const result = await proxyChatAttachmentContent({
      attachmentId,
      incomingHeaders: new Headers({ [REQUEST_ID_HEADER]: requestId }),
      sessionToken: "minted-session-token",
      apiBaseUrl: "http://localhost:3000",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.status).toBe(404);
  });

  it("percent-encodes the attachment id in the upstream URL", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("http://localhost:3000/chat/attachments/a%2Fb/content");
      return new Response(new Uint8Array([1]), {
        status: 200,
        headers: { "content-type": "image/png", [REQUEST_ID_HEADER]: requestId },
      });
    });

    const result = await proxyChatAttachmentContent({
      attachmentId: "a/b",
      incomingHeaders: new Headers({ [REQUEST_ID_HEADER]: requestId }),
      sessionToken: "minted-session-token",
      apiBaseUrl: "http://localhost:3000",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.status).toBe(200);
  });
});
