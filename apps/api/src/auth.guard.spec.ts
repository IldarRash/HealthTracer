import { UnauthorizedException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockJwtVerify = vi.hoisted(() => vi.fn());
const mockCreateRemoteJWKSet = vi.hoisted(() => vi.fn(() => ({})));

const mockEnv = vi.hoisted(() => ({
  CLERK_JWKS_URL: undefined as string | undefined,
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: mockCreateRemoteJWKSet,
  jwtVerify: mockJwtVerify,
}));

vi.mock("./env.js", () => ({
  env: mockEnv,
}));

function createContext(authHeader?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authHeader ? { authorization: authHeader } : {},
      }),
    }),
  };
}

describe("ClerkAuthGuard", () => {
  afterEach(() => {
    mockEnv.CLERK_JWKS_URL = undefined;
    mockJwtVerify.mockReset();
    mockCreateRemoteJWKSet.mockClear();
    vi.resetModules();
  });

  async function loadGuard() {
    const { ClerkAuthGuard } = await import("./auth.guard.js");
    return new ClerkAuthGuard();
  }

  it("rejects protected requests when Clerk JWKS is not configured", async () => {
    const guard = await loadGuard();

    await expect(
      guard.canActivate(
        createContext() as Parameters<
          Awaited<ReturnType<typeof loadGuard>>["canActivate"]
        >[0],
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects requests without a bearer token", async () => {
    mockEnv.CLERK_JWKS_URL = "https://clerk.example.com/.well-known/jwks.json";
    const guard = await loadGuard();

    await expect(
      guard.canActivate(
        createContext() as Parameters<
          Awaited<ReturnType<typeof loadGuard>>["canActivate"]
        >[0],
      ),
    ).rejects.toMatchObject({
      message: "Bearer token is required.",
    });

    expect(mockJwtVerify).not.toHaveBeenCalled();
  });

  it("returns UnauthorizedException when JWT verification fails", async () => {
    mockEnv.CLERK_JWKS_URL = "https://clerk.example.com/.well-known/jwks.json";
    mockJwtVerify.mockRejectedValue(new Error("signature verification failed"));
    const guard = await loadGuard();
    const token = "invalid.jwt.token";

    await expect(
      guard.canActivate(
        createContext(`Bearer ${token}`) as Parameters<
          Awaited<ReturnType<typeof loadGuard>>["canActivate"]
        >[0],
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      guard.canActivate(
        createContext(`Bearer ${token}`) as Parameters<
          Awaited<ReturnType<typeof loadGuard>>["canActivate"]
        >[0],
      ),
    ).rejects.toMatchObject({
      message: "Invalid or expired bearer token.",
    });
  });

  it("does not expose bearer tokens in unauthorized responses", async () => {
    mockEnv.CLERK_JWKS_URL = "https://clerk.example.com/.well-known/jwks.json";
    mockJwtVerify.mockRejectedValue(new Error("JWKS no matching key"));
    const guard = await loadGuard();
    const token = "super-secret.jwt.token";

    try {
      await guard.canActivate(
        createContext(`Bearer ${token}`) as Parameters<
          Awaited<ReturnType<typeof loadGuard>>["canActivate"]
        >[0],
      );
      expect.fail("Expected guard to reject invalid JWT");
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(JSON.stringify(error)).not.toContain(token);
      expect(JSON.stringify(error)).not.toContain("super-secret");
    }
  });
});
