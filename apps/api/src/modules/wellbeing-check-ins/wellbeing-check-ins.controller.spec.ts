import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { WellbeingCheckInsController } from "./wellbeing-check-ins.controller.js";

const auth = { clerkUserId: "clerk-user-1", email: "user@example.com" };

function createServiceMock() {
  return {
    getCheckInForToday: vi.fn(),
    upsertCheckInForToday: vi.fn(),
    getHistory: vi.fn(),
    getAggregates: vi.fn(),
    getCheckInForDate: vi.fn(),
    upsertCheckInForDate: vi.fn(),
  };
}

describe("WellbeingCheckInsController", () => {
  it("validates upsert payloads before calling the service", () => {
    const service = createServiceMock();
    const controller = new WellbeingCheckInsController(service as never);

    expect(() =>
      controller.upsertCheckInByDate(auth as never, "2026-05-25", {
        moodScore: 6,
        stressScore: 3,
      }),
    ).toThrow(BadRequestException);
    expect(service.upsertCheckInForDate).not.toHaveBeenCalled();
  });

  it("passes strict valid upsert payloads to the service", () => {
    const service = createServiceMock();
    const controller = new WellbeingCheckInsController(service as never);

    controller.upsertCheckInByDate(auth as never, "2026-05-25", {
      moodScore: 4,
      stressScore: 2,
      tags: ["steady"],
      note: "Felt okay.",
      source: "user_entry",
    });

    expect(service.upsertCheckInForDate).toHaveBeenCalledWith(auth, "2026-05-25", {
      moodScore: 4,
      stressScore: 2,
      tags: ["steady"],
      note: "Felt okay.",
      source: "user_entry",
    });
  });

  it("validates history and aggregate query payloads", () => {
    const service = createServiceMock();
    const controller = new WellbeingCheckInsController(service as never);

    controller.getHistory(auth as never, {});
    expect(service.getHistory).toHaveBeenCalledWith(auth, { limit: 14 });

    expect(() => controller.getHistory(auth as never, { limit: "31" })).toThrow(
      BadRequestException,
    );

    controller.getAggregates(auth as never, { limit: "7", periodType: "daily" });
    expect(service.getAggregates).toHaveBeenCalledWith(auth, {
      limit: 7,
      periodType: "daily",
    });

    expect(() =>
      controller.getAggregates(auth as never, { limit: "7", periodType: "weekly" }),
    ).toThrow(BadRequestException);
  });
});
