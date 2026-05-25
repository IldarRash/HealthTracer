import { describe, expect, it } from "vitest";
import {
  applyItemStatusUpdate,
  buildChecklistState,
  createHabitChecklistItem,
  createWorkoutChecklistItem,
  filterWorkoutSessionsForChecklist,
  findHabitDefinitionIdForItem,
  mapItemStatusToWorkoutStatus,
  mapWorkoutStatusToItemStatus,
  mergeHabitDefinitionsIntoItems,
  mergeProposalItemsWithExisting,
  mergeWorkoutSessionsIntoItems,
  normalizeProposalItems,
  syncTodayChecklistHabitItems,
  syncTodayChecklistWorkoutItems,
} from "./today-items.js";

const sessionId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const staleSessionId = "78d40655-b4b5-47b3-b28e-470192e05f04";
const planId = "3f98f3dd-806d-4386-8c5f-43499626c5d6";
const revisionId = "880099c6-3b5f-4383-8246-97b72bf61818";
const staleRevisionId = "a1000001-0000-4000-8000-000000000001";
const habitDefinitionId = "c3000003-0000-4000-8000-000000000003";
const staleHabitDefinitionId = "d4000004-0000-4000-8000-000000000004";

function buildHabitDefinition(
  id: string = habitDefinitionId,
  title = "Morning hydration",
  required = true,
) {
  return {
    habitDefinitionId: id,
    title,
    category: "hydration" as const,
    status: "active" as const,
    schedule: { type: "daily" as const },
    target: { type: "boolean" as const },
    required,
    displayOrder: 0,
  };
}

function buildSessionSummary(
  id: string,
  revision: string = revisionId,
  title = "Strength day",
) {
  return {
    id,
    title,
    status: "planned" as const,
    workoutPlanId: planId,
    workoutPlanRevisionId: revision,
  };
}

describe("today-items merge and reconciliation", () => {
  it("creates workout-linked checklist items from planned sessions", () => {
    const item = createWorkoutChecklistItem(buildSessionSummary(sessionId));

    expect(item.source).toEqual({ type: "workout_session", id: sessionId });
    expect(item.status).toBe("pending");
  });

  it("merges generated workout items without duplicating session refs", () => {
    const merged = mergeWorkoutSessionsIntoItems([], [
      buildSessionSummary(sessionId),
      buildSessionSummary(sessionId),
    ]);

    expect(merged).toHaveLength(1);
  });

  it("syncs workout-linked item status from workout session state", () => {
    const initial = createWorkoutChecklistItem(buildSessionSummary(sessionId));

    const merged = mergeWorkoutSessionsIntoItems([initial], [
      { ...buildSessionSummary(sessionId), status: "completed" },
    ]);

    expect(merged[0]?.status).toBe("completed");
  });

  it("preserves workout items when merging accepted proposal items", () => {
    const workoutItem = createWorkoutChecklistItem(buildSessionSummary(sessionId));
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
    const item = createWorkoutChecklistItem(buildSessionSummary(sessionId));
    const first = applyItemStatusUpdate([item], item.id, "completed");
    const second = applyItemStatusUpdate(first, item.id, "completed");

    expect(first[0]?.status).toBe("completed");
    expect(second[0]?.status).toBe("completed");
  });

  it("builds checklist adherence from merged item state", () => {
    const state = buildChecklistState([
      createWorkoutChecklistItem({ ...buildSessionSummary(sessionId), status: "completed" }),
      ...normalizeProposalItems([{ label: "Stretch", kind: "recovery" }]),
    ]);

    expect(state.adherence.totalRequired).toBeGreaterThan(0);
    expect(state.adherence.score).toBeGreaterThan(0);
  });

  it("preserves supported goal source refs when normalizing proposal items", () => {
    const [item] = normalizeProposalItems([
      {
        label: "Walk after lunch",
        kind: "habit",
        source: {
          type: "goal",
          id: "44444444-4444-4444-8444-444444444444",
        },
      },
    ]);

    expect(item?.source).toEqual({
      type: "goal",
      id: "44444444-4444-4444-8444-444444444444",
    });
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
    const workoutItem = createWorkoutChecklistItem(buildSessionSummary(sessionId));
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
    const item = createWorkoutChecklistItem(buildSessionSummary(sessionId));
    const skipped = applyItemStatusUpdate([item], item.id, "skipped");
    const again = applyItemStatusUpdate(skipped, item.id, "skipped");

    expect(skipped[0]?.status).toBe("skipped");
    expect(again[0]?.status).toBe("skipped");
  });

  it("scores pending required items as incomplete adherence", () => {
    const state = buildChecklistState([
      createWorkoutChecklistItem(buildSessionSummary(sessionId)),
    ]);

    expect(state.adherence.totalRequired).toBe(1);
    expect(state.adherence.completedRequired).toBe(0);
    expect(state.adherence.score).toBe(0);
  });

  it("filters workout sessions to the active plan revision", () => {
    const filtered = filterWorkoutSessionsForChecklist(
      [
        buildSessionSummary(sessionId, revisionId),
        buildSessionSummary(staleSessionId, staleRevisionId, "Old plan day"),
      ],
      { planId, activeRevisionId: revisionId },
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe(sessionId);
  });

  it("removes stale workout checklist items when syncing sessions", () => {
    const staleItem = createWorkoutChecklistItem(
      buildSessionSummary(staleSessionId, staleRevisionId, "Old plan day"),
    );
    const activeItem = createWorkoutChecklistItem(buildSessionSummary(sessionId));

    const synced = syncTodayChecklistWorkoutItems([staleItem, activeItem], [
      buildSessionSummary(sessionId),
    ]);

    expect(synced).toHaveLength(1);
    expect(synced[0]?.source).toEqual({ type: "workout_session", id: sessionId });
  });

  it("creates habit-linked checklist items from scheduled definitions", () => {
    const item = createHabitChecklistItem(buildHabitDefinition());

    expect(item.source).toEqual({ type: "habit", id: habitDefinitionId });
    expect(item.kind).toBe("habit");
    expect(item.status).toBe("pending");
    expect(item.required).toBe(true);
  });

  it("merges generated habit items without duplicating definition refs", () => {
    const habit = buildHabitDefinition();
    const merged = mergeHabitDefinitionsIntoItems([], [habit, habit]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.source).toEqual({ type: "habit", id: habitDefinitionId });
  });

  it("resolves habit definition ids only for habit-linked items", () => {
    const habitItem = createHabitChecklistItem(buildHabitDefinition());
    const workoutItem = createWorkoutChecklistItem(buildSessionSummary(sessionId));

    expect(findHabitDefinitionIdForItem([habitItem], habitItem.id)).toBe(habitDefinitionId);
    expect(findHabitDefinitionIdForItem([workoutItem], workoutItem.id)).toBeNull();
    expect(findHabitDefinitionIdForItem([habitItem], "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("includes required habit items in checklist adherence", () => {
    const completedHabit = {
      ...createHabitChecklistItem(buildHabitDefinition()),
      status: "completed" as const,
    };
    const pendingHabit = createHabitChecklistItem(
      buildHabitDefinition("d4000004-0000-4000-8000-000000000004", "Evening walk"),
    );

    const state = buildChecklistState([completedHabit, pendingHabit]);

    expect(state.adherence.totalRequired).toBe(2);
    expect(state.adherence.completedRequired).toBe(1);
    expect(state.adherence.score).toBe(0.5);
  });

  it("preserves existing habit item status while syncing label and required", () => {
    const existing = {
      ...createHabitChecklistItem(buildHabitDefinition()),
      status: "completed" as const,
    };

    const synced = mergeHabitDefinitionsIntoItems([existing], [
      buildHabitDefinition(habitDefinitionId, "Updated hydration title", false),
    ]);

    expect(synced).toHaveLength(1);
    expect(synced[0]?.label).toBe("Updated hydration title");
    expect(synced[0]?.required).toBe(false);
    expect(synced[0]?.status).toBe("completed");
  });

  it("removes stale habit checklist items when syncing scheduled definitions", () => {
    const staleItem = createHabitChecklistItem(
      buildHabitDefinition(staleHabitDefinitionId, "Old habit"),
    );
    const activeItem = createHabitChecklistItem(buildHabitDefinition());

    const synced = syncTodayChecklistHabitItems([staleItem, activeItem], [
      buildHabitDefinition(),
    ]);

    expect(synced).toHaveLength(1);
    expect(synced[0]?.source).toEqual({ type: "habit", id: habitDefinitionId });
  });

  it("preserves habit items when merging accepted proposal items", () => {
    const habitItem = createHabitChecklistItem(buildHabitDefinition());
    const proposalItems = normalizeProposalItems([
      { label: "Drink water", kind: "hydration" },
    ]);

    const merged = mergeProposalItemsWithExisting([habitItem], proposalItems);

    expect(merged).toHaveLength(2);
    expect(merged.some((item) => item.source.type === "habit")).toBe(true);
    expect(merged.some((item) => item.source.type === "ai_proposal")).toBe(true);
  });

  it("leaves non-habit checklist items untouched during habit sync", () => {
    const hydrationItem = normalizeProposalItems([
      { label: "Drink water", kind: "hydration" },
    ])[0]!;
    const workoutItem = createWorkoutChecklistItem(buildSessionSummary(sessionId));

    const synced = syncTodayChecklistHabitItems([hydrationItem, workoutItem], [
      buildHabitDefinition(),
    ]);

    expect(synced).toHaveLength(3);
    expect(synced.some((item) => item.source.type === "ai_proposal")).toBe(true);
    expect(synced.some((item) => item.source.type === "workout_session")).toBe(true);
    expect(synced.some((item) => item.source.type === "habit")).toBe(true);
  });
});
