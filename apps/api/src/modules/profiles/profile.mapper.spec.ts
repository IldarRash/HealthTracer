import { describe, expect, it } from "vitest";
import { toUserProfile } from "./profile.mapper.js";

describe("profile mapper", () => {
  const timestamp = new Date("2026-05-22T12:00:00.000Z");

  it("maps profile rows into client-safe contract values", () => {
    const profile = toUserProfile({
      id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      birthDate: new Date("1990-01-02T00:00:00.000Z") as never,
      heightCm: 180,
      baselineWeightKg: 82.5,
      activityLevel: "moderately_active",
      trainingExperience: "intermediate",
      preferences: ["strength", 12] as never,
      constraints: null as never,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(profile.birthDate).toBe("1990-01-02");
    expect(profile.preferences).toEqual(["strength"]);
    expect(profile.constraints).toEqual([]);
    expect(profile.createdAt).toBe("2026-05-22T12:00:00.000Z");
  });
});
