import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ClerkAuthGuard } from "./auth.guard.js";

describe("ClerkAuthGuard", () => {
  it("rejects protected requests when Clerk JWKS is not configured", async () => {
    const guard = new ClerkAuthGuard();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {},
        }),
      }),
    };

    await expect(
      guard.canActivate(context as Parameters<ClerkAuthGuard["canActivate"]>[0]),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
