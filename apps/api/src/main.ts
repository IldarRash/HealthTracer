import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { buildCorsOptions } from "./cors.helpers.js";
import { env } from "./env.js";
import { REQUEST_ID_HEADER } from "./observability/request-id.js";
import { logListening, logStartupDiagnostics } from "./observability/startup-diagnostics.js";

const JSON_BODY_LIMIT = "15mb";

async function bootstrap() {
  // Fail closed before creating the NestJS application so the error is
  // immediately visible rather than buried in startup logs.
  const corsOptions = buildCorsOptions({
    NODE_ENV: process.env.NODE_ENV,
    CORS_ORIGINS: env.CORS_ORIGINS,
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
    rawBody: true,
    // Surface module-init failures (e.g. storage production guards) instead of
    // Nest's silent process.exit(1) while the logger is disabled.
    abortOnError: false,
  });
  app.useBodyParser("json", { limit: JSON_BODY_LIMIT });
  app.useBodyParser("urlencoded", { limit: JSON_BODY_LIMIT, extended: true });
  app.enableCors({
    ...corsOptions,
    allowedHeaders: ["Authorization", "Content-Type", REQUEST_ID_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER],
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  });
  await app.listen(env.API_PORT, "0.0.0.0");
  logListening(env.API_PORT);
  logStartupDiagnostics(env.API_PORT);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
