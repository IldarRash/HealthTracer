import { describe, expect, it } from "vitest";
import { adherenceScoreValue, toTodayChecklistRecord, toTodayHistoryEntry } from "./today.mapper.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const checklistId = "3f98f3dd-806d-4386-8c5f-43499626c5d6";
const itemId = "880099c6-3b5f-4383-8246-97b72bf61818";
const timestamp = new Date("2026-05-22T12:00:00.000Z");

describe("today.mapper", () => {
  it("maps stored checklist rows into API records with adherence", () => {
    const record = toTodayChecklistRecord({
      id: checklistId,
      userId,
      date: "2026-05-22",
      items: [
        {
          id: itemId,
          label: "Strength day",
          kind: "workout",
          status: "completed",
          required: true,
          source: { type: "workout_session", id: itemId },
        },
      ],
      source: "generated",
      feedback: { notes: "Felt good.", energy: 8 },
      adherenceScore: "1.0000",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(record.adherence.score).toBe(1);
    expect(record.feedback?.energy).toBe(8);
  });

  it("maps history entries with feedback metadata", () => {
    const entry = toTodayHistoryEntry({
      id: checklistId,
      userId,
      date: "2026-05-22",
      items: [
        {
          id: itemId,
          label: "Stretch",
          kind: "recovery",
          status: "pending",
          required: false,
          source: { type: "ai_proposal" },
        },
      ],
      source: "ai_proposal",
      feedback: { notes: "Busy day." },
      adherenceScore: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(entry.itemCount).toBe(1);
    expect(entry.hasFeedback).toBe(true);
  });

  it("serializes adherence scores for persistence", () => {
    expect(
      adherenceScoreValue({
        score: 0.5,
        completedRequired: 1,
        totalRequired: 2,
        completedOptional: 0,
        skippedRequired: 1,
        skippedOptional: 0,
      }),
    ).toBe("0.5000");
  });
});
