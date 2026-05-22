import { validateEnv } from "@health/config/env";
import { z } from "zod";

export const mobileEnvSchema = z.object({
  EXPO_PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:3000"),
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
});

export const mobileEnv = validateEnv(mobileEnvSchema);
