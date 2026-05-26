import { describe, expect, it, vi } from "vitest";
import { REQUEST_ID_HEADER } from "./request-id.js";
import { RequestIdMiddleware } from "./request-id.middleware.js";

describe("RequestIdMiddleware", () => {
  it("propagates a client request id onto the request and response", () => {
    const middleware = new RequestIdMiddleware();
    const request = {
      headers: {
        [REQUEST_ID_HEADER]: "client-request-123",
      },
    };
    const setHeader = vi.fn();
    const response = { setHeader };
    const next = vi.fn();

    middleware.use(request as never, response as never, next);

    expect(request).toMatchObject({ requestId: "client-request-123" });
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, "client-request-123");
    expect(next).toHaveBeenCalledOnce();
  });

  it("generates a request id when the header is missing", () => {
    const middleware = new RequestIdMiddleware();
    const request: { headers: Record<string, never>; requestId?: string } = { headers: {} };
    const setHeader = vi.fn();
    const response = { setHeader };
    const next = vi.fn();

    middleware.use(request as never, response as never, next);

    expect(request.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, request.requestId);
  });

  it("generates a request id when the header is invalid", () => {
    const middleware = new RequestIdMiddleware();
    const request: { headers: Record<string, string>; requestId?: string } = {
      headers: {
        [REQUEST_ID_HEADER]: "bad id with spaces",
      },
    };
    const setHeader = vi.fn();
    const response = { setHeader };
    const next = vi.fn();

    middleware.use(request as never, response as never, next);

    expect(request.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, request.requestId);
  });
});
