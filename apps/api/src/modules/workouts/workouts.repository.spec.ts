import { describe, expect, it } from "vitest";
import { buildSessionCompletionUpdate } from "./workouts.repository.js";

const completedAt = new Date("2026-05-23T12:00:00.000Z");

describe("buildSessionCompletionUpdate", () => {
  it("sets completedAt when marking a planned session completed", () => {
    const update = buildSessionCompletionUpdate(
      { status: "planned", completedAt: null },
      { status: "completed", feedback: { notes: "Done." } },
    );

    expect(update.status).toBe("completed");
    expect(update.feedback).toEqual({ notes: "Done." });
    expect(update.completedAt).toBeInstanceOf(Date);
  });

  it("sets completedAt when marking a planned session skipped", () => {
    const update = buildSessionCompletionUpdate(
      { status: "planned", completedAt: null },
      { status: "skipped", feedback: {} },
    );

    expect(update.status).toBe("skipped");
    expect(update.completedAt).toBeInstanceOf(Date);
  });

  it("preserves completedAt when repeating the same completed status", () => {
    const update = buildSessionCompletionUpdate(
      { status: "completed", completedAt },
      { status: "completed", feedback: { notes: "Still done." } },
    );

    expect(update.status).toBe("completed");
    expect(update.completedAt).toBe(completedAt);
    expect(update.feedback).toEqual({ notes: "Still done." });
  });

  it("preserves completedAt when repeating the same skipped status", () => {
    const update = buildSessionCompletionUpdate(
      { status: "skipped", completedAt },
      { status: "skipped", feedback: { notes: "Still skipped." } },
    );

    expect(update.status).toBe("skipped");
    expect(update.completedAt).toBe(completedAt);
  });

  it("uses a new completedAt when changing between terminal statuses", () => {
    const before = buildSessionCompletionUpdate(
      { status: "completed", completedAt },
      { status: "skipped", feedback: {} },
    );

    expect(before.status).toBe("skipped");
    expect(before.completedAt).not.toBe(completedAt);
  });

  it("freezes completedAt on first repeat when a terminal row is missing it", () => {
    const first = buildSessionCompletionUpdate(
      { status: "completed", completedAt: null },
      { status: "completed", feedback: {} },
    );
    const second = buildSessionCompletionUpdate(
      { status: "completed", completedAt: first.completedAt },
      { status: "completed", feedback: { notes: "Again." } },
    );

    expect(second.completedAt).toBe(first.completedAt);
    expect(second.feedback).toEqual({ notes: "Again." });
  });
});
