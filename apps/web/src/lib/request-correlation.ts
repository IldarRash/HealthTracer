export const REQUEST_ID_HEADER = "x-request-id";

const REQUEST_ID_PATTERN = /^[\w-]{8,128}$/;

export function createRequestId(): string {
  return crypto.randomUUID();
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

export function resolveRequestId(incoming: string | null | undefined): string {
  return normalizeRequestId(incoming) ?? createRequestId();
}

export function getApiErrorMessage(
  result: Pick<{ error?: string; requestId?: string }, "error" | "requestId">,
): string | undefined {
  if (!result.error) {
    return undefined;
  }

  if (result.requestId) {
    return `${result.error} (Request ID: ${result.requestId})`;
  }

  return result.error;
}
