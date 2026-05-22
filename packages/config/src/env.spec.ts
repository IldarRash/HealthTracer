import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validateEnv } from "./env.js";

describe("validateEnv", () => {
  it("returns parsed values for valid environment input", () => {
    const schema = z.object({
      API_PORT: z.coerce.number().int().positive(),
    });

    expect(validateEnv(schema, { API_PORT: "3000" })).toEqual({
      API_PORT: 3000,
    });
  });

  it("throws for invalid environment input", () => {
    const schema = z.object({
      API_PORT: z.coerce.number().int().positive(),
    });

    expect(() => validateEnv(schema, { API_PORT: "invalid" })).toThrow(
      "Invalid environment",
    );
  });
});
