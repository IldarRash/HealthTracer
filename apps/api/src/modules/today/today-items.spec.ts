import { describe, expect, it } from "vitest";
import {
  applyItemStatusUpdate,
  buildChecklistState,
  createWorkoutChecklistItem,
  mapItemStatusToWorkoutStatus,
  mapWorkoutStatusToItemStatus,
  mergeProposalItemsWithExisting,
  mergeWorkoutSessionsIntoItems,
  normalizeProposalItems,
} from "./today-items.js";

const sessionId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";

describe("today-items merge and reconciliation", () => {
  it("creates workout-linked checklist items from planned sessions", () => {
    const item = createWorkoutChecklistItem({
      id: sessionId,
      title: "Strength day",
      status: "planned",
    });

    expect(item.source).toEqual({ type: "workout_session", id: sessionId });
    expect(item.status).toBe("pending");
  });

  it("merges generated workout items without duplicating session refs", () => {
    const merged = mergeWorkoutSessionsIntoItems([], [
      { id: sessionId, title: "Strength day", status: "planned" },
      { id: sessionId, title: "Strength day", status: "planned" },
    ]);

    expect(merged).toHaveLength(1);
  });

  it("syncs workout-linked item status from workout session state", () => {
    const initial = createWorkoutChecklistItem({
      id: sessionId,
      title: "Strength day",
      status: "planned",
    });

    const merged = mergeWorkoutSessionsIntoItems([initial], [
      { id: sessionId, title: "Strength day", status: "completed" },
    ]);

    expect(merged[0]?.status).toBe("completed");
  });

  it("preserves workout items when merging accepted proposal items", () => {
    const workoutItem = createWorkoutChecklistItem({
      id: sessionId,
      title: "Strength day",
      status: "planned",
    });
    const proposalItems = normalizeProposalItems([
      { label: "Drink water", kind: "hydration" },
    ]);

    const merged = mergeProposalItemsWithExisting([workoutItem], proposalItems);

    expect(merged).toHaveLength(2);
    expect(merged.some((item) => item.source.type === "workout_session")).toBe(true);
    expect(merged.some((item) => item.source.type === "ai_proposal")).toBe(true);
  });

  it("maps checklist completion status to workout session status", () => {
    expect(mapItemStatusToWorkoutStatus("completed")).toBe("completed");
    expect(mapItemStatusToWorkoutStatus("skipped")).toBe("skipped");
    expect(mapWorkoutStatusToItemStatus("planned")).toBe("pending");
  });

  it("applies idempotent item status updates", () => {
    const item = createWorkoutChecklistItem({
      id: sessionId,
      title: "Strength day",
      status: "planned",
    });
    const first = applyItemStatusUpdate([item], item.id, "completed");
    const second = applyItemStatusUpdate(first, item.id, "completed");

    expect(first[0]?.status).toBe("completed");
    expect(second[0]?.status).toBe("completed");
  });

  it("builds checklist adherence from merged item state", () => {
    const state = buildChecklistState([
      createWorkoutChecklistItem({
        id: sessionId,
        title: "Strength day",
        status: "completed",
      }),
      ...normalizeProposalItems([{ label: "Stretch", kind: "recovery" }]),
    ]);

    expect(state.adherence.totalRequired).toBeGreaterThan(0);
    expect(state.adherence.score).toBeGreaterThan(0);
  });

  it("defaults habit proposal items to optional", () => {
    const [habitItem, hydrationItem] = normalizeProposalItems([
      { label: "Evening walk", kind: "habit" },
      { label: "Drink water", kind: "hydration" },
    ]);

    expect(habitItem?.required).toBe(false);
    expect(hydrationItem?.required).toBe(true);
  });

  it("replaces prior ai proposal items while preserving workout-derived items", () => {
    const workoutItem = createWorkoutChecklistItem({
      id: sessionId,
      title: "Strength day",
      status: "planned",
    });
    const priorProposalItems = normalizeProposalItems([
      { label: "Old stretch", kind: "recovery" },
    ]);
    const nextProposalItems = normalizeProposalItems([
      { label: "New stretch", kind: "recovery" },
    ]);

    const merged = mergeProposalItemsWithExisting(
      [...priorProposalItems, workoutItem],
      nextProposalItems,
    );

    expect(merged.filter((item) => item.source.type === "workout_session")).toHaveLength(1);
    expect(merged.filter((item) => item.source.type === "ai_proposal")).toHaveLength(1);
    expect(merged.some((item) => item.label === "Old stretch")).toBe(false);
    expect(merged.some((item) => item.label === "New stretch")).toBe(true);
  });

  it("applies idempotent skip updates", () => {
    const item = createWorkoutChecklistItem({
      id: sessionId,
      title: "Strength day",
      status: "planned",
    });
    const skipped = applyItemStatusUpdate([item], item.id, "skipped");
    const again = applyItemStatusUpdate(skipped, item.id, "skipped");

    expect(skipped[0]?.status).toBe("skipped");
    expect(again[0]?.status).toBe("skipped");
  });

  it("scores pending required items as incomplete adherence", () => {
    const state = buildChecklistState([
      createWorkoutChecklistItem({
        id: sessionId,
        title: "Strength day",
        status: "planned",
      }),
    ]);

    expect(state.adherence.totalRequired).toBe(1);
    expect(state.adherence.completedRequired).toBe(0);
    expect(state.adherence.score).toBe(0);
  });
});
