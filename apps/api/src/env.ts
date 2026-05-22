import { validateEnv } from "@health/config/env";
import { z } from "zod";

export const apiEnvSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(3000),
  CLERK_JWKS_URL: z.string().url().optional(),
});

export const env = validateEnv(apiEnvSchema);
