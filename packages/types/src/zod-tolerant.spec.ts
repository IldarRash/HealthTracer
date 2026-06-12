import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { tolerantArraySchema } from "./zod-tolerant.js";

const elementSchema = z.object({
  id: z.string().uuid(),
  secretNote: z.string().min(1),
});

const VALID_ELEMENT = {
  id: "aaaaaaaa-0000-4000-a000-000000000001",
  secretNote: "private health detail",
};

describe("tolerantArraySchema", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("keeps all elements when every element is valid", () => {
    const schema = tolerantArraySchema(elementSchema, "test.entity");
    const result = schema.parse([VALID_ELEMENT, VALID_ELEMENT]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(VALID_ELEMENT);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("drops the broken element and keeps the rest, in order", () => {
    const schema = tolerantArraySchema(elementSchema, "test.entity");
    const broken = { id: "not-a-uuid", secretNote: "leaky payload contents" };
    const result = schema.parse([VALID_ELEMENT, broken, VALID_ELEMENT]);

    expect(result).toHaveLength(2);
    expect(result).toEqual([VALID_ELEMENT, VALID_ELEMENT]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("warns with label, index, and issue paths — never element contents", () => {
    const schema = tolerantArraySchema(elementSchema, "test.entity");
    const broken = { id: "not-a-uuid", secretNote: "leaky payload contents" };
    schema.parse([broken]);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0]?.[0]);
    expect(message).toContain("test.entity[0]");
    expect(message).toContain("id");
    // Privacy floor: payload contents must never reach the console.
    expect(message).not.toContain("leaky payload contents");
    expect(message).not.toContain("not-a-uuid");
  });

  it("returns an empty array when every element is broken", () => {
    const schema = tolerantArraySchema(elementSchema, "test.entity");
    const result = schema.parse([{ bogus: true }, 42, null]);

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it("uses (root) as the path marker for non-object elements", () => {
    const schema = tolerantArraySchema(elementSchema, "test.entity");
    schema.parse([12]);

    const message = String(warnSpy.mock.calls[0]?.[0]);
    expect(message).toContain("(root)");
  });

  it("still rejects a non-array input", () => {
    const schema = tolerantArraySchema(elementSchema, "test.entity");
    expect(schema.safeParse({ not: "an array" }).success).toBe(false);
    expect(schema.safeParse("nope").success).toBe(false);
  });
});
