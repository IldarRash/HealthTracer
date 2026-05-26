import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { env } from "./env.js";

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
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: resolveCorsOrigin(),
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type"],
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  });
  await app.listen(env.API_PORT, "0.0.0.0");
}

void bootstrap();
