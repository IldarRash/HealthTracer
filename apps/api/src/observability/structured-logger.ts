export type LogLevel = "debug" | "info" | "warn" | "error";

export type StructuredLogEntry = {
  service: string;
  environment: string;
  level: LogLevel;
  timestamp: string;
  message: string;
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  event?: string;
  errorCategory?: string;
  errorName?: string;
  stack?: string;
  port?: number;
  integrations?: Record<string, string>;
};

export const OBSERVABILITY_SERVICE_NAME = "health-api";

export function getRuntimeEnvironment(): string {
  return process.env.NODE_ENV?.trim() || "development";
}

export function isProductionEnvironment(): boolean {
  return getRuntimeEnvironment() === "production";
}

export function writeStructuredLog(
  entry: Omit<StructuredLogEntry, "service" | "environment" | "timestamp"> &
    Partial<Pick<StructuredLogEntry, "service" | "environment">>,
): void {
  const payload: StructuredLogEntry = {
    service: entry.service ?? OBSERVABILITY_SERVICE_NAME,
    environment: entry.environment ?? getRuntimeEnvironment(),
    timestamp: new Date().toISOString(),
    level: entry.level,
    message: entry.message,
  };

  if (entry.requestId !== undefined) {
    payload.requestId = entry.requestId;
  }
  if (entry.method !== undefined) {
    payload.method = entry.method;
  }
  if (entry.path !== undefined) {
    payload.path = entry.path;
  }
  if (entry.statusCode !== undefined) {
    payload.statusCode = entry.statusCode;
  }
  if (entry.durationMs !== undefined) {
    payload.durationMs = entry.durationMs;
  }
  if (entry.event !== undefined) {
    payload.event = entry.event;
  }
  if (entry.errorCategory !== undefined) {
    payload.errorCategory = entry.errorCategory;
  }
  if (entry.errorName !== undefined) {
    payload.errorName = entry.errorName;
  }
  if (entry.stack !== undefined) {
    payload.stack = entry.stack;
  }
  if (entry.port !== undefined) {
    payload.port = entry.port;
  }
  if (entry.integrations !== undefined) {
    payload.integrations = entry.integrations;
  }

  const line = JSON.stringify(payload);

  if (entry.level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}
