import { z } from "zod";

export type EnvSchema<T extends z.ZodRawShape> = z.ZodObject<T>;

export function validateEnv<T extends z.ZodRawShape>(
  schema: EnvSchema<T>,
  env: Record<string, string | undefined> = process.env,
) {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }

  return parsed.data;
}
