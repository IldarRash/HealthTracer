import type {
  TodayChecklistItem,
  TodayChecklistItemStatus,
  TodayChecklistProposalItem,
  WorkoutSession,
} from "@health/types";
import {
  calculateTodayAdherence,
  resolveProposalItemStatus,
} from "@health/types";

type WorkoutSessionSummary = Pick<
  WorkoutSession,
  "id" | "title" | "status" | "workoutPlanId" | "workoutPlanRevisionId"
>;

export interface ActiveWorkoutPlanChecklistContext {
  planId: string;
  activeRevisionId: string;
}

export function mapWorkoutStatusToItemStatus(
  sessionStatus: WorkoutSession["status"],
): TodayChecklistItemStatus {
  switch (sessionStatus) {
    case "completed":
      return "completed";
    case "skipped":
      return "skipped";
    default:
      return "pending";
  }
}

export function mapItemStatusToWorkoutStatus(
  itemStatus: TodayChecklistItemStatus,
): "completed" | "skipped" | "planned" {
  switch (itemStatus) {
    case "completed":
      return "completed";
    case "skipped":
      return "skipped";
    default:
      return "planned";
  }
}

export function isWorkoutLinkedItem(item: TodayChecklistItem): boolean {
  return item.source.type === "workout_session" && Boolean(item.source.id);
}

export function createWorkoutChecklistItem(session: WorkoutSessionSummary): TodayChecklistItem {
  return {
    id: crypto.randomUUID(),
    label: session.title,
    kind: "workout",
    status: mapWorkoutStatusToItemStatus(session.status),
    required: true,
    source: {
      type: "workout_session",
      id: session.id,
    },
  };
}

export function normalizeProposalItems(
  items: TodayChecklistProposalItem[],
): TodayChecklistItem[] {
  return items.map((item) => ({
    id: crypto.randomUUID(),
    label: item.label,
    kind: item.kind,
    status: resolveProposalItemStatus(item),
    required: item.required ?? item.kind !== "habit",
    source: {
      type: "ai_proposal" as const,
    },
  }));
}

export function filterWorkoutSessionsForChecklist(
  sessions: WorkoutSessionSummary[],
  activePlan: ActiveWorkoutPlanChecklistContext | null,
): WorkoutSessionSummary[] {
  if (!activePlan) {
    return sessions;
  }

  return sessions.filter(
    (session) =>
      session.workoutPlanId === activePlan.planId &&
      session.workoutPlanRevisionId === activePlan.activeRevisionId,
  );
}

export function pruneSupersededWorkoutChecklistItems(
  items: TodayChecklistItem[],
  retainedSessionIds: ReadonlySet<string>,
): TodayChecklistItem[] {
  return items.filter((item) => {
    if (item.source.type !== "workout_session" || !item.source.id) {
      return true;
    }

    return retainedSessionIds.has(item.source.id);
  });
}

export function syncTodayChecklistWorkoutItems(
  items: TodayChecklistItem[],
  sessions: WorkoutSessionSummary[],
): TodayChecklistItem[] {
  const retainedSessionIds = new Set(sessions.map((session) => session.id));

  return mergeWorkoutSessionsIntoItems(
    pruneSupersededWorkoutChecklistItems(items, retainedSessionIds),
    sessions,
  );
}

export function mergeWorkoutSessionsIntoItems(
  items: TodayChecklistItem[],
  sessions: WorkoutSessionSummary[],
): TodayChecklistItem[] {
  const merged = [...items];

  for (const session of sessions) {
    const existingIndex = merged.findIndex(
      (item) =>
        item.source.type === "workout_session" && item.source.id === session.id,
    );

    if (existingIndex === -1) {
      merged.push(createWorkoutChecklistItem(session));
      continue;
    }

    merged[existingIndex] = syncWorkoutLinkedItem(merged[existingIndex]!, session);
  }

  return merged;
}

export function syncWorkoutLinkedItem(
  item: TodayChecklistItem,
  session: WorkoutSessionSummary,
): TodayChecklistItem {
  if (!isWorkoutLinkedItem(item)) {
    return item;
  }

  return {
    ...item,
    label: session.title,
    status: mapWorkoutStatusToItemStatus(session.status),
  };
}

export function mergeProposalItemsWithExisting(
  existingItems: TodayChecklistItem[],
  proposalItems: TodayChecklistItem[],
): TodayChecklistItem[] {
  const preservedItems = existingItems.filter(
    (item) => item.source.type === "workout_session" || item.source.type === "generated",
  );

  return [...preservedItems, ...proposalItems];
}

export function buildChecklistState(items: TodayChecklistItem[]) {
  return {
    items,
    adherence: calculateTodayAdherence(items),
  };
}

export function applyItemStatusUpdate(
  items: TodayChecklistItem[],
  itemId: string,
  status: Extract<TodayChecklistItemStatus, "completed" | "skipped">,
): TodayChecklistItem[] {
  return items.map((item) => {
    if (item.id !== itemId) {
      return item;
    }

    if (item.status === status) {
      return item;
    }

    return {
      ...item,
      status,
    };
  });
}

export function findWorkoutSessionIdForItem(
  items: TodayChecklistItem[],
  itemId: string,
): string | null {
  const item = items.find((entry) => entry.id === itemId);

  if (!item || item.source.type !== "workout_session" || !item.source.id) {
    return null;
  }

  return item.source.id;
}
