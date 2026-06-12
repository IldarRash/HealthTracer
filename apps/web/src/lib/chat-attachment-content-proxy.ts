import { proxyApiRequest, type ApiProxyResponse } from "./api-proxy-handler.js";
import { REQUEST_ID_HEADER, resolveRequestId } from "./request-correlation.js";

export type ChatAttachmentContentProxyInput = {
  attachmentId: string;
  /** Incoming request headers — used only for request-id correlation. */
  incomingHeaders: Headers;
  /**
   * Bearer token minted server-side from the Clerk session cookie
   * (`auth().getToken()`); null when the request carries no valid session.
   */
  sessionToken: string | null;
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
};

/**
 * Server-side proxy for chat attachment image content.
 *
 * Persisted chat messages render attachment thumbnails with a plain <img src>,
 * which cannot attach the Clerk bearer token the API requires. This helper
 * backs the dedicated GET route at /api-proxy/chat/attachments/:id/content:
 * the route mints the token from the session cookie and this helper forwards
 * the request to the API via the shared proxy.
 *
 * Auth/ownership stays enforced by the API — 401/403/404 responses pass
 * through untouched. The binary body is streamed with content-type and
 * cache-control passthrough (the API sends `private, no-store`; no public
 * caching is added here).
 */
export async function proxyChatAttachmentContent(
  input: ChatAttachmentContentProxyInput,
): Promise<ApiProxyResponse> {
  const requestId = resolveRequestId(input.incomingHeaders.get(REQUEST_ID_HEADER));

  if (!input.sessionToken) {
    // No session — answer 401 locally instead of forwarding an unauthenticated
    // request upstream. Mirrors the API's JSON error shape.
    return {
      status: 401,
      headers: new Headers({
        "content-type": "application/json",
        [REQUEST_ID_HEADER]: requestId,
      }),
      body: new TextEncoder().encode(
        JSON.stringify({ statusCode: 401, message: "Authentication required." }),
      ).buffer,
      requestId,
      durationMs: 0,
    };
  }

  const headers = new Headers({
    authorization: `Bearer ${input.sessionToken}`,
    [REQUEST_ID_HEADER]: requestId,
  });

  return proxyApiRequest({
    method: "GET",
    pathSegments: ["chat", "attachments", input.attachmentId, "content"],
    search: "",
    headers,
    body: null,
    apiBaseUrl: input.apiBaseUrl,
    fetchImpl: input.fetchImpl,
  });
}
