import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { AuthenticatedRequest } from "./auth.types.js";
import { env } from "./env.js";

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly jwks = env.CLERK_JWKS_URL
    ? createRemoteJWKSet(new URL(env.CLERK_JWKS_URL))
    : null;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.jwks) {
      throw new UnauthorizedException("Clerk JWKS URL is not configured.");
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = getBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException("Bearer token is required.");
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.jwks));
    } catch {
      throw new UnauthorizedException("Invalid or expired bearer token.");
    }

    const clerkUserId = payload.sub;

    if (!clerkUserId) {
      throw new UnauthorizedException("Token is missing subject.");
    }

    request.auth = {
      clerkUserId,
      displayName: getDisplayName(payload),
      email: getEmail(payload) ?? `${clerkUserId}@clerk.local`,
    };

    return true;
  }
}

function getBearerToken(authorization: string | string[] | undefined): string | null {
  const header = Array.isArray(authorization) ? authorization[0] : authorization;

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim();
}

function getEmail(payload: JWTPayload): string | null {
  const email = payload.email;

  return typeof email === "string" && email.length > 0 ? email : null;
}

function getDisplayName(payload: JWTPayload): string | null {
  const name = payload.name;

  return typeof name === "string" && name.length > 0 ? name : null;
}
