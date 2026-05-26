import { sanitizePathForLogging } from "./path-sanitizer.js";

type LogLevel = "info" | "error";

type StructuredLogEntry = {
  level: LogLevel;
  service: "health-web";
  event: string;
  timestamp: string;
  [key: string]: unknown;
};

function writeStructuredLog(entry: StructuredLogEntry): void {
  const line = JSON.stringify(entry);

  if (entry.level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

export function logWebStartupDiagnostics(): void {
  writeStructuredLog({
    level: "info",
    service: "health-web",
    event: "startup",
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV ?? "development",
    apiBaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_API_BASE_URL),
    clerkPublishableKeyConfigured: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
  });
}

export type ApiProxyLogInput = {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
};

export function logApiProxyRequest(input: ApiProxyLogInput): void {
  writeStructuredLog({
    level: input.statusCode >= 500 ? "error" : "info",
    service: "health-web",
    event: "api_proxy",
    timestamp: new Date().toISOString(),
    requestId: input.requestId,
    method: input.method,
    path: sanitizePathForLogging(input.path),
    statusCode: input.statusCode,
    durationMs: input.durationMs,
  });
}
