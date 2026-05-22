import { validateEnv } from "@health/config/env";
import { z } from "zod";

export const webEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:3000"),
});

export const webEnv = validateEnv(webEnvSchema);
