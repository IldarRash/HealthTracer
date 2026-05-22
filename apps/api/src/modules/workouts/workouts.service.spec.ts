import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { buildSessionCompletionUpdate } from "./workouts.repository.js";
import { WorkoutsService } from "./workouts.service.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const auth = {
  clerkUserId: "clerk-user-1",
  email: "test@example.com",
  displayName: "Test User",
};

const payload = {
  title: "Strength base",
  summary: "Three repeatable training days.",
  days: [{ day: "Day 1", focus: "Strength", exercises: ["Squat"] }],
  notes: [],
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

describe("WorkoutsService", () => {
  it("returns an empty active plan state when the user has no plan", async () => {
    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => null,
      } as never,
      usersService as never,
    );

    await expect(service.getCurrentActivePlan(auth)).resolves.toEqual({
      plan: null,
      activeRevision: null,
      sessions: [],
    });
  });

  it("schedules a session only through the active revision", async () => {
    const service = new WorkoutsService(
      {
        findActiveRevisionForUser: async (resolvedUserId: string, revisionId: string) => ({
          revision: { id: revisionId },
          plan: { id: "3f98f3dd-806d-4386-8c5f-43499626c5d6", userId: resolvedUserId },
        }),
        scheduleSession: async (
          resolvedUserId: string,
          workoutPlanId: string,
          input: { workoutPlanRevisionId: string },
        ) => ({
          id: "78d40655-b4b5-47b3-b28e-470192e05f04",
          userId: resolvedUserId,
          workoutPlanId,
          workoutPlanRevisionId: input.workoutPlanRevisionId,
          plannedDate: "2026-05-23",
          title: "Strength day",
          status: "planned",
          exercises: ["Squat"],
          feedback: {},
          completedAt: null,
          createdAt: new Date("2026-05-22T12:00:00.000Z"),
          updatedAt: new Date("2026-05-22T12:00:00.000Z"),
        }),
      } as never,
      usersService as never,
    );

    const session = await service.scheduleCurrentSession(auth, {
      workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
      plannedDate: "2026-05-23",
      title: "Strength day",
      exercises: ["Squat"],
    });

    expect(session.userId).toBe(userId);
    expect(session.workoutPlanRevisionId).toBe(
      "880099c6-3b5f-4383-8246-97b72bf61818",
    );
  });

  it("completes a user-owned session with feedback", async () => {
    const service = new WorkoutsService(
      {
        completeSession: async (
          resolvedUserId: string,
          sessionId: string,
          input: { feedback: { notes?: string | null } },
        ) => ({
          id: sessionId,
          userId: resolvedUserId,
          workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
          workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
          plannedDate: "2026-05-23",
          title: "Strength day",
          status: "completed",
          exercises: [{ name: "Squat", sets: 3, reps: "8" }],
          feedback: input.feedback,
          completedAt: new Date("2026-05-23T12:00:00.000Z"),
          createdAt: new Date("2026-05-22T12:00:00.000Z"),
          updatedAt: new Date("2026-05-23T12:00:00.000Z"),
        }),
      } as never,
      usersService as never,
    );

    const session = await service.completeCurrentSession(
      auth,
      "78d40655-b4b5-47b3-b28e-470192e05f04",
      {
        status: "completed",
        feedback: { notes: "Felt strong." },
      },
    );

    expect(session.status).toBe("completed");
    expect(session.feedback.notes).toBe("Felt strong.");
  });

  it("appends a revision when create races with an existing active plan", async () => {
    let findCount = 0;
    let appendCalled = false;

    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => {
          findCount += 1;
          return findCount === 1 ? null : { id: "plan-race-1" };
        },
        createPlanWithRevision: async () => {
          throw Object.assign(new Error("duplicate active workout plan"), {
            code: "23505",
          });
        },
        appendRevision: async () => {
          appendCalled = true;
          return { id: "rev-append-race" };
        },
      } as never,
      usersService as never,
    );

    const reference = await service.applyWorkoutPlanProposal(
      userId,
      payload,
      "Starting a new plan.",
      "create_workout_plan",
    );

    expect(reference).toBe("workout_revision:rev-append-race");
    expect(appendCalled).toBe(true);
  });

  it("creates a new plan revision for create_workout_plan intent", async () => {
    let appendCalled = false;

    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => null,
        createPlanWithRevision: async () => ({
          revision: { id: "rev-create-1" },
        }),
        appendRevision: async () => {
          appendCalled = true;
          return { id: "rev-append-1" };
        },
      } as never,
      usersService as never,
    );

    const reference = await service.applyWorkoutPlanProposal(
      userId,
      payload,
      "Starting a new plan.",
      "create_workout_plan",
    );

    expect(reference).toBe("workout_revision:rev-create-1");
    expect(appendCalled).toBe(false);
  });

  it("appends a revision when adapting an existing plan", async () => {
    let createCalled = false;
    let appendPlanId: string | undefined;
    let appendReason: string | undefined;
    let appendPayload: typeof payload | undefined;

    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => ({ id: "plan-1" }),
        createPlanWithRevision: async () => {
          createCalled = true;
          return { revision: { id: "rev-create-2" } };
        },
        appendRevision: async (
          planId: string,
          nextPayload: typeof payload,
          reason: string,
        ) => {
          appendPlanId = planId;
          appendPayload = nextPayload;
          appendReason = reason;
          return { id: "rev-append-2" };
        },
      } as never,
      usersService as never,
    );

    const reference = await service.applyWorkoutPlanProposal(
      userId,
      payload,
      "Adjusting the current plan.",
      "adapt_workout_plan",
    );

    expect(reference).toBe("workout_revision:rev-append-2");
    expect(createCalled).toBe(false);
    expect(appendPlanId).toBe("plan-1");
    expect(appendReason).toBe("Adjusting the current plan.");
    expect(appendPayload).toEqual(payload);
  });

  it("appends a revision for create_workout_plan when an active plan exists", async () => {
    let createCalled = false;
    let appendCalled = false;

    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => ({ id: "plan-1" }),
        createPlanWithRevision: async () => {
          createCalled = true;
          return { revision: { id: "rev-create-3" } };
        },
        appendRevision: async () => {
          appendCalled = true;
          return { id: "rev-append-3" };
        },
      } as never,
      usersService as never,
    );

    const reference = await service.applyWorkoutPlanProposal(
      userId,
      payload,
      "Replacing the current plan.",
      "create_workout_plan",
    );

    expect(reference).toBe("workout_revision:rev-append-3");
    expect(createCalled).toBe(false);
    expect(appendCalled).toBe(true);
  });

  it("returns the active plan, revision, and sessions when a plan exists", async () => {
    const planRow = {
      id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      userId,
      activeRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
      status: "active",
      createdAt: new Date("2026-05-20T12:00:00.000Z"),
      updatedAt: new Date("2026-05-22T12:00:00.000Z"),
    };
    const revisionRow = {
      id: "880099c6-3b5f-4383-8246-97b72bf61818",
      workoutPlanId: planRow.id,
      revisionNumber: 1,
      reason: "Starting plan",
      source: "ai_proposal",
      payload,
      createdAt: new Date("2026-05-20T12:00:00.000Z"),
    };
    const sessionRow = {
      id: "78d40655-b4b5-47b3-b28e-470192e05f04",
      userId,
      workoutPlanId: planRow.id,
      workoutPlanRevisionId: revisionRow.id,
      plannedDate: "2026-05-23",
      title: "Strength day",
      status: "planned",
      exercises: ["Squat"],
      feedback: {},
      completedAt: null,
      createdAt: new Date("2026-05-22T12:00:00.000Z"),
      updatedAt: new Date("2026-05-22T12:00:00.000Z"),
    };

    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => planRow,
        findActiveRevisionByPlanId: async () => revisionRow,
        listSessionsByPlanId: async () => [sessionRow],
      } as never,
      usersService as never,
    );

    const result = await service.getCurrentActivePlan(auth);

    expect(result.plan?.id).toBe(planRow.id);
    expect(result.activeRevision?.revisionNumber).toBe(1);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.status).toBe("planned");
  });

  it("lists revision history for the authenticated user", async () => {
    const service = new WorkoutsService(
      {
        listRevisionsByUserId: async (resolvedUserId: string) => [
          {
            id: "880099c6-3b5f-4383-8246-97b72bf61818",
            workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
            revisionNumber: 2,
            reason: "Adjusted plan",
            source: "ai_proposal",
            payload,
            createdAt: new Date("2026-05-22T12:00:00.000Z"),
          },
          {
            id: "770088b5-2a4e-4372-7135-86a61ae50707",
            workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
            revisionNumber: 1,
            reason: "Initial plan",
            source: "ai_proposal",
            payload,
            createdAt: new Date("2026-05-20T12:00:00.000Z"),
          },
        ].filter(() => resolvedUserId === userId),
      } as never,
      usersService as never,
    );

    const revisions = await service.listCurrentRevisions(auth);

    expect(revisions).toHaveLength(2);
    expect(revisions[0]?.revisionNumber).toBe(2);
  });

  it("rejects scheduling against a revision the user does not own", async () => {
    const service = new WorkoutsService(
      {
        findActiveRevisionForUser: async () => null,
      } as never,
      usersService as never,
    );

    await expect(
      service.scheduleCurrentSession(auth, {
        workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
        plannedDate: "2026-05-23",
        title: "Strength day",
        exercises: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects scheduling against a non-active revision", async () => {
    const service = new WorkoutsService(
      {
        findActiveRevisionForUser: async () => null,
        findRevisionForUser: async (resolvedUserId: string, revisionId: string) => ({
          revision: { id: revisionId },
          plan: { id: "3f98f3dd-806d-4386-8c5f-43499626c5d6", userId: resolvedUserId },
        }),
      } as never,
      usersService as never,
    );

    await expect(
      service.scheduleCurrentSession(auth, {
        workoutPlanRevisionId: "770088b5-2a4e-4372-7135-86a61ae50707",
        plannedDate: "2026-05-23",
        title: "Old revision day",
        exercises: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("keeps completion timestamps stable when completing twice with the same status", async () => {
    let storedSession = {
      id: "78d40655-b4b5-47b3-b28e-470192e05f04",
      userId,
      workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
      plannedDate: "2026-05-23",
      title: "Strength day",
      status: "planned",
      exercises: [{ name: "Squat", sets: 3, reps: "8" }],
      feedback: {},
      completedAt: null as Date | null,
      createdAt: new Date("2026-05-22T12:00:00.000Z"),
      updatedAt: new Date("2026-05-22T12:00:00.000Z"),
    };

    const service = new WorkoutsService(
      {
        completeSession: async (
          resolvedUserId: string,
          sessionId: string,
          input: { status: "completed" | "skipped"; feedback: Record<string, unknown> },
        ) => {
          if (resolvedUserId !== userId || sessionId !== storedSession.id) {
            return null;
          }

          const completionUpdate = buildSessionCompletionUpdate(storedSession, input);
          storedSession = {
            ...storedSession,
            ...completionUpdate,
            updatedAt: new Date("2026-05-23T12:30:00.000Z"),
          };

          return storedSession;
        },
      } as never,
      usersService as never,
    );

    const first = await service.completeCurrentSession(
      auth,
      storedSession.id,
      { status: "completed", feedback: { notes: "Done." } },
    );
    const firstCompletedAt = first.completedAt;

    vi.setSystemTime(new Date("2026-05-24T08:00:00.000Z"));

    const second = await service.completeCurrentSession(
      auth,
      storedSession.id,
      { status: "completed", feedback: { notes: "Done again." } },
    );

    expect(second.status).toBe("completed");
    expect(second.completedAt).toBe(firstCompletedAt);
    expect(second.feedback.notes).toBe("Done again.");

    vi.useRealTimers();
  });

  it("allows changing from skipped to completed with a new completion timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-23T09:00:00.000Z"));

    let storedSession = {
      id: "78d40655-b4b5-47b3-b28e-470192e05f04",
      userId,
      workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
      plannedDate: "2026-05-23",
      title: "Strength day",
      status: "planned",
      exercises: [],
      feedback: {},
      completedAt: null as Date | null,
      createdAt: new Date("2026-05-22T12:00:00.000Z"),
      updatedAt: new Date("2026-05-22T12:00:00.000Z"),
    };

    const service = new WorkoutsService(
      {
        completeSession: async (
          resolvedUserId: string,
          sessionId: string,
          input: { status: "completed" | "skipped"; feedback: Record<string, unknown> },
        ) => {
          if (resolvedUserId !== userId || sessionId !== storedSession.id) {
            return null;
          }

          const completionUpdate = buildSessionCompletionUpdate(storedSession, input);
          storedSession = { ...storedSession, ...completionUpdate };
          return storedSession;
        },
      } as never,
      usersService as never,
    );

    const skipped = await service.completeCurrentSession(auth, storedSession.id, {
      status: "skipped",
      feedback: { notes: "Rest day." },
    });

    vi.setSystemTime(new Date("2026-05-23T11:00:00.000Z"));

    const completed = await service.completeCurrentSession(auth, storedSession.id, {
      status: "completed",
      feedback: { notes: "Did it anyway." },
    });

    expect(skipped.status).toBe("skipped");
    expect(skipped.completedAt).toBe("2026-05-23T09:00:00.000Z");
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBe("2026-05-23T11:00:00.000Z");
    expect(completed.feedback.notes).toBe("Did it anyway.");

    vi.useRealTimers();
  });

  it("rejects completion when the session is not found for the user", async () => {
    const service = new WorkoutsService(
      {
        completeSession: async () => null,
      } as never,
      usersService as never,
    );

    await expect(
      service.completeCurrentSession(auth, "78d40655-b4b5-47b3-b28e-470192e05f04", {
        status: "completed",
        feedback: {},
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
