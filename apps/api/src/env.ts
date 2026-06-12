import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEnv } from "@health/config/env";
import { z } from "zod";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

export const apiEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().optional(),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://postgres:postgres@localhost:5432/health_tracer"),
  CLERK_JWKS_URL: z.string().url().optional(),
  LAB_REPORT_STORAGE_PATH: z.string().min(1).default(".data/lab-reports"),
  CHAT_ATTACHMENT_STORAGE_PATH: z.string().min(1).default(".data/chat-attachments"),
  AI_COACH_PROVIDER: z.literal("openai").default("openai"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  /** Override model for the router (first-LLM) stage. Falls back to OPENAI_MODEL. */
  OPENAI_MODEL_ROUTER: z.string().min(1).optional(),
  /** Override model for the domain (parallel fan-out) stage. Falls back to OPENAI_MODEL. */
  OPENAI_MODEL_DOMAIN: z.string().min(1).optional(),
  /** Override model for the decision-maker (final synthesis) stage. Falls back to OPENAI_MODEL. */
  OPENAI_MODEL_DECISION: z.string().min(1).optional(),
  /** Override model for the out-of-band lab-extraction stage. Falls back to OPENAI_MODEL. */
  OPENAI_MODEL_LAB_EXTRACTION: z.string().min(1).optional(),
  /** Override model for the proposal self-repair call. Falls back to OPENAI_MODEL_DECISION, then OPENAI_MODEL. */
  OPENAI_REPAIR_MODEL: z.string().min(1).optional(),
  CORS_ORIGINS: z.string().min(1).optional(),
  STORAGE_ALLOW_LOCAL_IN_PRODUCTION: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  DOMAIN_CONFIG_DIR: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRICE_PRO: z.string().min(1).optional(),
  WEB_APP_BASE_URL: z.string().url().default("http://localhost:3001"),
});

const parsedEnv = validateEnv(apiEnvSchema);

export const env = {
  ...parsedEnv,
  API_PORT: parsedEnv.PORT ?? parsedEnv.API_PORT,
};
