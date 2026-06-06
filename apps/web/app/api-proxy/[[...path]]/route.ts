import { proxyApiRequest, readProxyRequestBody } from "../../../src/lib/api-proxy-handler.js";
import { webEnv } from "../../../src/env.js";
import { REQUEST_ID_HEADER } from "../../../src/lib/request-correlation.js";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function handleProxy(request: Request, context: RouteContext): Promise<Response> {
  const { path = [] } = await context.params;
  const method = request.method.toUpperCase();
  const body = await readProxyRequestBody(method, request);

  try {
    const proxied = await proxyApiRequest({
      method,
      pathSegments: path,
      search: new URL(request.url).search,
      headers: request.headers,
      body,
      apiBaseUrl: webEnv.NEXT_PUBLIC_API_BASE_URL,
    });

    return new Response(proxied.body, {
      status: proxied.status,
      headers: proxied.headers,
    });
  } catch {
    return new Response(
      JSON.stringify({ statusCode: 500, message: "Internal proxy error." }),
      {
        status: 500,
        headers: {
          "content-type": "application/json",
          [REQUEST_ID_HEADER]: crypto.randomUUID(),
        },
      },
    );
  }
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handleProxy(request, context);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return handleProxy(request, context);
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  return handleProxy(request, context);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return handleProxy(request, context);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return handleProxy(request, context);
}

export async function HEAD(request: Request, context: RouteContext): Promise<Response> {
  return handleProxy(request, context);
}

export async function OPTIONS(request: Request, context: RouteContext): Promise<Response> {
  return handleProxy(request, context);
}
