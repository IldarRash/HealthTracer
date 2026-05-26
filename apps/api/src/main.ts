import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { env } from "./env.js";
import { REQUEST_ID_HEADER } from "./observability/request-id.js";
import { logListening, logStartupDiagnostics } from "./observability/startup-diagnostics.js";

function resolveCorsOrigin():
  | boolean
  | string[]
  | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void) {
  const configuredOrigins = env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins?.length) {
    return configuredOrigins;
  }

  // Reflect the request Origin instead of "*". Safari blocks Authorization
  // requests when ACAO is a wildcard.
  return (origin, callback) => {
    callback(null, true);
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: false,
  });
  app.enableCors({
    origin: resolveCorsOrigin(),
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type", REQUEST_ID_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER],
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  });
  await app.listen(env.API_PORT, "0.0.0.0");
  logListening(env.API_PORT);
  logStartupDiagnostics(env.API_PORT);
}

void bootstrap();
