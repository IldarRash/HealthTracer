import { BadRequestException } from "@nestjs/common";
import type { z } from "zod";

export function parseBody<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new BadRequestException({
      message: "Invalid request body",
      issues: result.error.issues,
    });
  }

  return result.data;
}
