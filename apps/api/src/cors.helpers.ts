import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface.js";

export type CorsEnv = {
  CORS_ORIGINS?: string;
  NODE_ENV?: string;
};

/**
 * Builds NestJS CORS options from the runtime environment.
 *
 * In production, an empty CORS_ORIGINS is a misconfiguration — the API would
 * silently reflect every request origin with credentials:true, which is a
 * security hole.  Throw early with a clear message so the deploy fails loudly
 * rather than quietly permitting cross-origin requests.
 *
 * In development/test, an empty list falls back to permissive origin reflection
 * (same as before) so local developer workflows keep working without extra config.
 */
export function buildCorsOptions(environment: CorsEnv): CorsOptions {
  const isProduction = (environment.NODE_ENV ?? "development") === "production";

  const configuredOrigins = environment.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins && configuredOrigins.length > 0) {
    return {
      origin: (origin, callback) => {
        if (!origin || configuredOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin "${origin}" is not allowed by CORS policy.`));
        }
      },
      credentials: true,
    };
  }

  if (isProduction) {
    throw new Error(
      "CORS_ORIGINS must be set in production. " +
        "Refusing to start with a permissive wildcard CORS policy. " +
        "Set CORS_ORIGINS to a comma-separated list of allowed origin URLs.",
    );
  }

  // Dev / test: reflect the request Origin (wildcard * blocks credentials in Safari).
  return {
    origin: (_origin, callback) => {
      callback(null, true);
    },
    credentials: true,
  };
}
