import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { TodayService } from "./today.service.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const auth = {
  clerkUserId: "clerk-user-1",
  email: "test@example.com",
  displayName: "Test User",
};

const usersService = {
  resolveFromAuth: async () => ({
    id: userId,
    email: auth.email,
    displayName: auth.displayName,
    timezone: "UTC",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
};

const sessionId = "78d40655-b4b5-47b3-b28e-470192e05f04";
const checklistId = "3f98f3dd-806d-4386-8c5f-43499626c5d6";
const itemId = "880099c6-3b5f-4383-8246-97b72bf61818";
const date = "2026-05-22";
const timestamp = new Date("2026-05-22T12:00:00.000Z");

function buildChecklistRow(items: Record<string, unknown>[]) {
  return {
    id: checklistId,
    userId,
    date,
    items,
    source: "generated",
    feedback: null,
    adherenceScore: "1.0000",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("TodayService", () => {
  it("rejects invalid ISO dates", async () => {
    const service = new TodayService({} as never, {} as never, usersService as never);

    await expect(service.getOrGenerateDay(auth, "05/22/2026")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.getOrGenerateDay(auth, "2026-99-99")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("generates a checklist from workout sessions when none exists", async () => {
    let upsertCalled = false;

    const service = new TodayService(
      {
        findByUserAndDate: async () => null,
        upsertChecklist: async (
          resolvedUserId: string,
          resolvedDate: string,
          items: { source: { type: string } }[],
        ) => {
          upsertCalled = true;
          expect(resolvedUserId).toBe(userId);
          expect(resolvedDate).toBe(date);
          expect(items[0]?.source.type).toBe("workout_session");

          return buildChecklistRow(items);
        },
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [
          {
            id: sessionId,
            title: "Strength day",
            status: "planned",
          },
        ],
      } as never,
      usersService as never,
    );

    const day = await service.getOrGenerateDay(auth, date);

    expect(upsertCalled).toBe(true);
    expect(day.items).toHaveLength(1);
    expect(day.items[0]?.source.id).toBe(sessionId);
  });

  it("returns idempotently when item status is unchanged", async () => {
    const existingItem = {
      id: itemId,
      label: "Strength day",
      kind: "workout",
      status: "completed",
      required: true,
      source: { type: "workout_session", id: sessionId },
    };

    const service = new TodayService(
      {
        findByUserAndDate: async () => buildChecklistRow([existingItem]),
        updateChecklistState: async () => {
          throw new Error("Should not persist when status is unchanged.");
        },
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [
          { id: sessionId, title: "Strength day", status: "completed" },
        ],
      } as never,
      usersService as never,
    );

    const day = await service.updateItemStatus(auth, date, itemId, {
      status: "completed",
    });

    expect(day.items[0]?.status).toBe("completed");
  });

  it("reconciles workout session completion when a workout-linked item is updated", async () => {
    let completeCalled = false;
    const existingItem = {
      id: itemId,
      label: "Strength day",
      kind: "workout",
      status: "pending",
      required: true,
      source: { type: "workout_session", id: sessionId },
    };

    const service = new TodayService(
      {
        findByUserAndDate: async () => buildChecklistRow([existingItem]),
        updateChecklistState: async () =>
          buildChecklistRow([{ ...existingItem, status: "completed" }]),
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [
          { id: sessionId, title: "Strength day", status: "planned" },
        ],
        findSessionByUserId: async () => ({
          id: sessionId,
          status: "planned",
          feedback: { notes: "Felt strong." },
        }),
        completeSession: async (
          resolvedUserId: string,
          resolvedSessionId: string,
          input: { status: string; feedback: { notes?: string | null } },
        ) => {
          completeCalled = true;
          expect(resolvedUserId).toBe(userId);
          expect(resolvedSessionId).toBe(sessionId);
          expect(input.status).toBe("completed");
          expect(input.feedback.notes).toBe("Felt strong.");
          return { id: sessionId };
        },
      } as never,
      usersService as never,
    );

    const day = await service.updateItemStatus(auth, date, itemId, {
      status: "completed",
    });

    expect(completeCalled).toBe(true);
    expect(day.items[0]?.status).toBe("completed");
  });

  it("does not overwrite already-terminal workout sessions from Today updates", async () => {
    let completeCalled = false;
    const existingItem = {
      id: itemId,
      label: "Strength day",
      kind: "workout",
      status: "pending",
      required: true,
      source: { type: "workout_session", id: sessionId },
    };

    const service = new TodayService(
      {
        findByUserAndDate: async () => buildChecklistRow([existingItem]),
        updateChecklistState: async () =>
          buildChecklistRow([{ ...existingItem, status: "skipped" }]),
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [
          { id: sessionId, title: "Strength day", status: "completed" },
        ],
        findSessionByUserId: async () => ({
          id: sessionId,
          status: "completed",
          feedback: { notes: "Keep this feedback." },
        }),
        completeSession: async () => {
          completeCalled = true;
          return { id: sessionId };
        },
      } as never,
      usersService as never,
    );

    const day = await service.updateItemStatus(auth, date, itemId, {
      status: "skipped",
    });

    expect(completeCalled).toBe(false);
    expect(day.items[0]?.status).toBe("skipped");
  });

  it("throws when updating an unknown checklist item", async () => {
    const service = new TodayService(
      {
        findByUserAndDate: async () => buildChecklistRow([]),
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
      usersService as never,
    );

    await expect(
      service.updateItemStatus(auth, date, itemId, { status: "completed" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns idempotently when skip status is unchanged", async () => {
    const existingItem = {
      id: itemId,
      label: "Strength day",
      kind: "workout",
      status: "skipped",
      required: true,
      source: { type: "workout_session", id: sessionId },
    };

    const service = new TodayService(
      {
        findByUserAndDate: async () => buildChecklistRow([existingItem]),
        updateChecklistState: async () => {
          throw new Error("Should not persist when skip status is unchanged.");
        },
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [
          { id: sessionId, title: "Strength day", status: "skipped" },
        ],
      } as never,
      usersService as never,
    );

    const day = await service.updateItemStatus(auth, date, itemId, {
      status: "skipped",
    });

    expect(day.items[0]?.status).toBe("skipped");
  });

  it("generates an empty checklist when no workout sessions exist", async () => {
    const service = new TodayService(
      {
        findByUserAndDate: async () => null,
        upsertChecklist: async (
          _resolvedUserId: string,
          _resolvedDate: string,
          items: Record<string, unknown>[],
        ) => buildChecklistRow(items),
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
      usersService as never,
    );

    const day = await service.getOrGenerateDay(auth, date);

    expect(day.items).toEqual([]);
    expect(day.adherence.score).toBeNull();
  });

  it("passes history limit to the repository", async () => {
    let capturedLimit = 0;

    const service = new TodayService(
      {
        listRecentByUserId: async (_resolvedUserId: string, limit: number) => {
          capturedLimit = limit;
          return [];
        },
      } as never,
      {} as never,
      usersService as never,
    );

    const history = await service.getRecentHistory(auth, 14);

    expect(capturedLimit).toBe(14);
    expect(history.entries).toEqual([]);
  });

  it("rejects invalid ISO dates on feedback updates", async () => {
    const service = new TodayService({} as never, {} as never, usersService as never);

    await expect(
      service.updateFeedback(auth, "2026/05/22", { notes: "Steady day." }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("merges accepted proposal items with existing workout-derived items", async () => {
    let upsertItems: { source: { type: string } }[] = [];

    const service = new TodayService(
      {
        findByUserAndDate: async () => null,
        createChecklistFromProposal: async (
          _resolvedUserId: string,
          _payload: unknown,
          items: { source: { type: string } }[],
        ) => {
          upsertItems = items;
          return buildChecklistRow(items);
        },
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [
          { id: sessionId, title: "Strength day", status: "planned" },
        ],
      } as never,
      usersService as never,
    );

    await service.applyTodayChecklistProposal(userId, {
      date,
      items: [{ label: "Drink water", kind: "hydration", completed: false }],
    });

    expect(upsertItems.some((item) => item.source.type === "workout_session")).toBe(true);
    expect(upsertItems.some((item) => item.source.type === "ai_proposal")).toBe(true);
  });
});
