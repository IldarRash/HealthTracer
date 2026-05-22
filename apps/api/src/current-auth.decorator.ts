import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest, ClerkAuthContext } from "./auth.types.js";

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ClerkAuthContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.auth) {
      throw new Error("Authenticated request is missing auth context.");
    }

    return request.auth;
  },
);
