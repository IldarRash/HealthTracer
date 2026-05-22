import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEnv } from "@health/config/env";
import { z } from "zod";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

export const apiEnvSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://postgres:postgres@localhost:5432/health_tracer"),
  CLERK_JWKS_URL: z.string().url().optional(),
  DOCUMENT_STORAGE_PATH: z.string().min(1).default(".data/documents"),
});

export const env = validateEnv(apiEnvSchema);
