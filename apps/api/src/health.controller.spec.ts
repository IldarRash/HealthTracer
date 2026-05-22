import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller.js";

describe("HealthController", () => {
  it("returns an ok health response", () => {
    const controller = new HealthController();

    expect(controller.getHealth()).toEqual({
      service: "api",
      status: "ok",
    });
  });
});
