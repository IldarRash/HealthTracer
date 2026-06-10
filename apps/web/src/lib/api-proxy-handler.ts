import {
  REQUEST_ID_HEADER,
  normalizeRequestId,
  resolveRequestId,
} from "./request-correlation.js";
import { logApiProxyRequest } from "./server-log.js";

const FORWARDED_REQUEST_HEADERS = ["authorization", "content-type", "accept"] as const;

export type ApiProxyRequestInput = {
  method: string;
  pathSegments: string[];
  search: string;
  headers: Headers;
  body: ArrayBuffer | null;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
};

export type ApiProxyResponse = {
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | ArrayBuffer;
  requestId: string;
  durationMs: number;
};

function buildUpstreamPath(pathSegments: string[]): string {
  return pathSegments.map(encodeURIComponent).join("/");
}

function buildForwardHeaders(incoming: Headers, requestId: string): Headers {
  const headers = new Headers();

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = incoming.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  headers.set(REQUEST_ID_HEADER, requestId);
  return headers;
}

function buildProxyPath(pathSegments: string[], search: string): string {
  const path = pathSegments.length > 0 ? `/${buildUpstreamPath(pathSegments)}` : "";
  return `/api-proxy${path}${search}`;
}

export async function proxyApiRequest(
  input: ApiProxyRequestInput,
): Promise<ApiProxyResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const requestId = resolveRequestId(input.headers.get(REQUEST_ID_HEADER));
  const upstreamPath = buildUpstreamPath(input.pathSegments);
  const upstreamUrl = `${input.apiBaseUrl.replace(/\/$/, "")}/${upstreamPath}${input.search}`;
  const proxyPath = buildProxyPath(input.pathSegments, input.search);
  const startedAt = Date.now();

  try {
    const upstreamResponse = await fetchImpl(upstreamUrl, {
      method: input.method,
      headers: buildForwardHeaders(input.headers, requestId),
      body: input.body,
      redirect: "manual",
      cache: "no-store",
    });

    const durationMs = Date.now() - startedAt;
    const responseRequestId =
      normalizeRequestId(upstreamResponse.headers.get(REQUEST_ID_HEADER)) ?? requestId;

    logApiProxyRequest({
      requestId: responseRequestId,
      method: input.method,
      path: proxyPath,
      statusCode: upstreamResponse.status,
      durationMs,
    });

    // Opaque redirects (redirect:"manual" on some runtimes) return status=0, which is
    // an invalid Response status. Treat them as a 502 rather than letting the caller throw.
    const upstreamStatus =
      upstreamResponse.status === 0 ? 502 : upstreamResponse.status;

    const responseHeaders = new Headers();
    responseHeaders.set(REQUEST_ID_HEADER, responseRequestId);

    const contentType = upstreamResponse.headers.get("content-type");
    if (contentType) {
      responseHeaders.set("content-type", contentType);
    }

    const responseBody: ReadableStream<Uint8Array> | ArrayBuffer =
      upstreamStatus === 502 && upstreamResponse.status === 0
        ? new TextEncoder().encode(
            JSON.stringify({ statusCode: 502, message: "Upstream API is unavailable." }),
          ).buffer
        : (upstreamResponse.body ?? new ReadableStream());

    return {
      status: upstreamStatus,
      headers: responseHeaders,
      body: responseBody,
      requestId: responseRequestId,
      durationMs,
    };
  } catch {
    const durationMs = Date.now() - startedAt;

    logApiProxyRequest({
      requestId,
      method: input.method,
      path: proxyPath,
      statusCode: 502,
      durationMs,
    });

    const responseHeaders = new Headers({
      [REQUEST_ID_HEADER]: requestId,
      "content-type": "application/json",
    });

    return {
      status: 502,
      headers: responseHeaders,
      body: new TextEncoder().encode(
        JSON.stringify({
          statusCode: 502,
          message: "Upstream API is unavailable.",
        }),
      ).buffer,
      requestId,
      durationMs,
    };
  }
}

export async function readProxyRequestBody(
  method: string,
  request: Request,
): Promise<ArrayBuffer | null> {
  if (method === "GET" || method === "HEAD") {
    return null;
  }

  return request.arrayBuffer();
}
