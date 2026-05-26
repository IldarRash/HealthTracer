import { getConfigDiagnostics } from "./config-diagnostics.js";
import { writeStructuredLog } from "./structured-logger.js";

export function logStartupDiagnostics(port: number): void {
  const config = getConfigDiagnostics();

  writeStructuredLog({
    level: "info",
    message: "API startup diagnostics",
    event: "startup.diagnostics",
    port,
    integrations: {
      clerkJwks: config.clerkJwks,
      aiCoachProvider: config.aiCoachProvider,
      openai: config.openai,
      corsOrigins: config.corsOrigins,
      documentStorage: config.documentStorage,
      databaseUrl: config.databaseUrl,
    },
  });
}

export function logListening(port: number): void {
  writeStructuredLog({
    level: "info",
    message: "API listening",
    event: "startup.ready",
    port,
  });
}
