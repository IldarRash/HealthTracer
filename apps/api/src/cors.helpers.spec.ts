import { describe, expect, it } from "vitest";
import { buildCorsOptions } from "./cors.helpers.js";

function callOriginCallback(
  options: ReturnType<typeof buildCorsOptions>,
  origin: string | undefined,
): Promise<boolean | Error> {
  return new Promise((resolve) => {
    const originOption = options.origin;
    if (typeof originOption !== "function") {
      resolve(typeof originOption === "boolean" ? originOption : false);
      return;
    }
    (originOption as (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void)(
      origin,
      (err, allow) => {
        if (err) {
          resolve(err);
        } else {
          resolve(allow ?? false);
        }
      },
    );
  });
}

describe("buildCorsOptions", () => {
  describe("production + empty CORS_ORIGINS", () => {
    it("throws at startup with a clear error message", () => {
      expect(() => buildCorsOptions({ NODE_ENV: "production" })).toThrowError(
        /CORS_ORIGINS must be set in production/,
      );
    });
  });

  describe("production + origins configured", () => {
    const options = buildCorsOptions({
      NODE_ENV: "production",
      CORS_ORIGINS: "https://app.example.com,https://admin.example.com",
    });

    it("allows a listed origin", async () => {
      const result = await callOriginCallback(options, "https://app.example.com");
      expect(result).toBe(true);
    });

    it("allows undefined origin (server-to-server, e.g. curl)", async () => {
      const result = await callOriginCallback(options, undefined);
      expect(result).toBe(true);
    });

    it("rejects an unlisted origin with an Error", async () => {
      const result = await callOriginCallback(options, "https://evil.example.com");
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toMatch(/not allowed by CORS policy/);
    });

    it("sets credentials:true", () => {
      expect(options.credentials).toBe(true);
    });
  });

  describe("development + empty CORS_ORIGINS", () => {
    it("returns permissive options without throwing", () => {
      expect(() => buildCorsOptions({ NODE_ENV: "development" })).not.toThrow();
    });

    it("allows any origin in dev mode", async () => {
      const options = buildCorsOptions({ NODE_ENV: "development" });
      const result = await callOriginCallback(options, "https://anything.example.com");
      expect(result).toBe(true);
    });
  });

  describe("no NODE_ENV (defaults to dev-permissive)", () => {
    it("does not throw when NODE_ENV is absent and CORS_ORIGINS is empty", () => {
      expect(() => buildCorsOptions({})).not.toThrow();
    });
  });
});
