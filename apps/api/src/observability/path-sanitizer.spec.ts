import { describe, expect, it } from "vitest";
import { sanitizePathForLogging } from "./path-sanitizer.js";

describe("sanitizePathForLogging", () => {
  it("strips query strings", () => {
    expect(sanitizePathForLogging("/chat?prompt=secret")).toBe("/chat");
  });

  it("replaces uuid path segments", () => {
    expect(
      sanitizePathForLogging(
        "/documents/5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      ),
    ).toBe("/documents/:id");
  });

  it("replaces iso date path segments", () => {
    expect(sanitizePathForLogging("/workouts/today/2026-05-26/start")).toBe(
      "/workouts/today/:date/start",
    );
  });
});
