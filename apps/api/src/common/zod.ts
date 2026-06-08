import { BadRequestException } from "@nestjs/common";
import type { z } from "zod";
import { translate } from "../i18n/messages.js";

export function parseBody<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new BadRequestException({
      message: translate("invalid_request_body", "en"),
      code: "invalid_request_body",
      issues: result.error.issues,
    });
  }

  return result.data;
}

export function parseQuery<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new BadRequestException({
      message: translate("invalid_query_parameters", "en"),
      code: "invalid_query_parameters",
      issues: result.error.issues,
    });
  }

  return result.data;
}
