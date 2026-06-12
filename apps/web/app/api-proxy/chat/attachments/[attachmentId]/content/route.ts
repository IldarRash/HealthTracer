import { auth } from "@clerk/nextjs/server";
import { proxyChatAttachmentContent } from "../../../../../../src/lib/chat-attachment-content-proxy.js";
import { webEnv } from "../../../../../../src/env.js";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ attachmentId: string }>;
};

/**
 * GET /api-proxy/chat/attachments/:attachmentId/content
 *
 * Dedicated image-content proxy for chat attachment thumbnails rendered via a
 * plain <img src> (which cannot send the Clerk bearer token). Mints the token
 * from the session cookie server-side and forwards to the API, streaming the
 * binary body back. This specific route takes precedence over the generic
 * /api-proxy/[[...path]] catch-all, which deliberately stays cookie-blind.
 *
 * GET-only by design: no other method may piggyback on cookie-derived auth.
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { attachmentId } = await context.params;
  const { getToken } = await auth();
  const sessionToken = await getToken();

  const proxied = await proxyChatAttachmentContent({
    attachmentId,
    incomingHeaders: request.headers,
    sessionToken,
    apiBaseUrl: webEnv.NEXT_PUBLIC_API_BASE_URL,
  });

  return new Response(proxied.body, {
    status: proxied.status,
    headers: proxied.headers,
  });
}
