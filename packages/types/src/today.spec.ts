import { describe, expect, it } from "vitest";
import {
  calculateTodayAdherence,
  resolveProposalItemStatus,
  todayChecklistItemSchema,
  todayChecklistPayloadSchema,
  todayDailyFeedbackSchema,
  todayDayResponseSchema,
  todayHistoryQuerySchema,
  todayHistoryResponseSchema,
  updateTodayItemStatusSchema,
} from "./today.js";

describe("phase 5 today contracts", () => {
  it("accepts legacy proposal items with completed boolean", () => {
    const payload = todayChecklistPayloadSchema.parse({
      date: "2026-05-22",
      items: [{ label: "Drink water", kind: "hydration", completed: false }],
    });

    expect(payload.items[0]?.completed).toBe(false);
    expect(resolveProposalItemStatus(payload.items[0]!)).toBe("pending");
  });

  it("maps completed boolean and explicit status for proposal items", () => {
    expect(
      resolveProposalItemStatus({
        label: "Stretch",
        kind: "recovery",
        completed: true,
      }),
    ).toBe("completed");

    expect(
      resolveProposalItemStatus({
        label: "Walk",
        kind: "habit",
        status: "skipped",
      }),
    ).toBe("skipped");
  });

  it("validates checklist items with stable ids, status, and source refs", () => {
    const item = todayChecklistItemSchema.parse({
      id: "78d40655-b4b5-47b3-b28e-470192e05f04",
      label: "Lower body day",
      kind: "workout",
      status: "pending",
      required: true,
      source: {
        type: "workout_session",
        id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      },
    });

    expect(item.source.type).toBe("workout_session");
  });

  it("calculates adherence from required item completion only", () => {
    const adherence = calculateTodayAdherence([
      { status: "completed", required: true },
      { status: "skipped", required: true },
      { status: "completed", required: false },
    ]);

    expect(adherence.totalRequired).toBe(2);
    expect(adherence.completedRequired).toBe(1);
    expect(adherence.skippedRequired).toBe(1);
    expect(adherence.score).toBe(0.5);
  });

  it("returns null adherence score when no required items exist", () => {
    expect(
      calculateTodayAdherence([{ status: "completed", required: false }]).score,
    ).toBeNull();
  });

  it("scores all required completed as 1 and all skipped as 0", () => {
    expect(
      calculateTodayAdherence([
        { status: "completed", required: true },
        { status: "completed", required: true },
      ]).score,
    ).toBe(1);

    expect(
      calculateTodayAdherence([
        { status: "skipped", required: true },
        { status: "skipped", required: true },
      ]).score,
    ).toBe(0);
  });

  it("ignores pending required items in completed and skipped counts", () => {
    const adherence = calculateTodayAdherence([
      { status: "completed", required: true },
      { status: "pending", required: true },
      { status: "pending", required: true },
    ]);

    expect(adherence.completedRequired).toBe(1);
    expect(adherence.skippedRequired).toBe(0);
    expect(adherence.totalRequired).toBe(3);
    expect(adherence.score).toBeCloseTo(1 / 3, 4);
  });

  it("tracks optional skipped items separately from required adherence", () => {
    const adherence = calculateTodayAdherence([
      { status: "completed", required: true },
      { status: "skipped", required: false },
    ]);

    expect(adherence.skippedOptional).toBe(1);
    expect(adherence.skippedRequired).toBe(0);
    expect(adherence.score).toBe(1);
  });

  it("validates today checklist proposal payloads and history query limits", () => {
    expect(() =>
      todayChecklistPayloadSchema.parse({
        date: "2026-05-22",
        items: [],
      }),
    ).toThrow();

    expect(() =>
      todayChecklistPayloadSchema.parse({
        date: "05/22/2026",
        items: [{ label: "Drink water", kind: "hydration" }],
      }),
    ).toThrow();

    expect(() =>
      todayChecklistPayloadSchema.parse({
        date: "2026-99-99",
        items: [{ label: "Drink water", kind: "hydration" }],
      }),
    ).toThrow();

    expect(todayHistoryQuerySchema.parse({}).limit).toBe(7);
    expect(todayHistoryQuerySchema.parse({ limit: "14" }).limit).toBe(14);
    expect(() => todayHistoryQuerySchema.parse({ limit: 0 })).toThrow();
    expect(() => todayHistoryQuerySchema.parse({ limit: 31 })).toThrow();
  });

  it("validates bounded daily feedback and item status updates", () => {
    expect(() =>
      todayDailyFeedbackSchema.parse({
        notes: "Felt steady today.",
        energy: 7,
        difficulty: 4,
      }),
    ).not.toThrow();

    expect(() =>
      todayDailyFeedbackSchema.parse({
        notes: "x".repeat(501),
      }),
    ).toThrow();

    expect(updateTodayItemStatusSchema.parse({ status: "completed" }).status).toBe(
      "completed",
    );
    expect(() => updateTodayItemStatusSchema.parse({ status: "pending" })).toThrow();
  });

  it("parses day and history response shapes", () => {
    const timestamp = "2026-05-22T12:00:00.000Z";
    const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
    const checklistId = "78d40655-b4b5-47b3-b28e-470192e05f04";

    expect(() =>
      todayDayResponseSchema.parse({
        id: checklistId,
        userId,
        date: "2026-05-22",
        items: [],
        source: "generated",
        feedback: null,
        adherence: {
          score: null,
          completedRequired: 0,
          totalRequired: 0,
          completedOptional: 0,
          skippedRequired: 0,
          skippedOptional: 0,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ).not.toThrow();

    expect(() =>
      todayHistoryResponseSchema.parse({
        entries: [
          {
            date: "2026-05-22",
            adherence: {
              score: 1,
              completedRequired: 1,
              totalRequired: 1,
              completedOptional: 0,
              skippedRequired: 0,
              skippedOptional: 0,
            },
            itemCount: 1,
            hasFeedback: false,
          },
        ],
      }),
    ).not.toThrow();
  });
});
