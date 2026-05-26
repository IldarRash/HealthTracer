import { randomUUID } from "node:crypto";
import type { HttpRequest } from "./http.types.js";

export const REQUEST_ID_HEADER = "x-request-id";

const REQUEST_ID_PATTERN = /^[\w-]{8,128}$/;

export type RequestWithId = HttpRequest;

export function createRequestId(): string {
  return randomUUID();
}

export function normalizeRequestId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!REQUEST_ID_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function resolveRequestId(headerValue: string | string[] | undefined): string {
  const incoming = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return normalizeRequestId(incoming) ?? createRequestId();
}

export function getRequestId(request: HttpRequest): string | undefined {
  return request.requestId;
}
