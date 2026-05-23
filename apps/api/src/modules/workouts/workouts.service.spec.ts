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

const exercisesService = {
  findInaccessibleExerciseIds: async () => [],
  findOrCreateExercise: async (input: {
    name: string;
    userId: string | null;
  }) => ({
    id: "d1000001-0000-4000-8000-000000000099",
    name: input.name,
    normalizedName: input.name.toLowerCase(),
    aliases: [],
    primaryMuscles: ["back"],
    secondaryMuscles: [],
    equipment: ["resistance_band"],
    movementPatterns: ["pull"],
    difficulty: "beginner",
    instructions: ["Pull with control."],
    safetyNotes: ["Use a light band."],
    source: "ai_generated",
    validationStatus: "pending_validation",
    status: "active",
    userId: input.userId,
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
      exercisesService as never,
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
      exercisesService as never,
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
      exercisesService as never,
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
      exercisesService as never,
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

  it("rejects apply when workout payload has no exercises", async () => {
    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => null,
      } as never,
      usersService as never,
      exercisesService as never,
    );

    await expect(
      service.applyWorkoutPlanProposal(
        userId,
        {
          title: "Strength base",
          summary: "Empty plan.",
          days: [{ day: "Day 1", focus: "Strength", exercises: [] }],
          notes: [],
        },
        "Starting a new plan.",
        "create_workout_plan",
      ),
    ).rejects.toMatchObject({
      response: {
        validationErrors: ["workout: At least one plan day must include exercises."],
      },
    });
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
      exercisesService as never,
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
      exercisesService as never,
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
      exercisesService as never,
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
      exercisesService as never,
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
      exercisesService as never,
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
      exercisesService as never,
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
      exercisesService as never,
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
      exercisesService as never,
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
      exercisesService as never,
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

  it("persists pending exercises and resolves refs before creating a revision", async () => {
    let persistedPayload: typeof payload | undefined;
    let findOrCreateCalled = false;

    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => null,
        createPlanWithRevision: async (
          _userId: string,
          nextPayload: typeof payload,
        ) => {
          persistedPayload = nextPayload;
          return { revision: { id: "rev-pending-1" } };
        },
      } as never,
      usersService as never,
      {
        findInaccessibleExerciseIds: async () => [],
        findOrCreateExercise: async () => {
          findOrCreateCalled = true;
          return {
            id: "d1000001-0000-4000-8000-000000000099",
            name: "Band Pull-Apart",
            normalizedName: "band pull-apart",
            aliases: [],
            primaryMuscles: ["back"],
            secondaryMuscles: [],
            equipment: ["resistance_band"],
            movementPatterns: ["pull"],
            difficulty: "beginner",
            instructions: ["Pull with control."],
            safetyNotes: ["Use a light band."],
            source: "ai_generated",
            validationStatus: "pending_validation",
            status: "active",
            userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        },
      } as never,
    );

    const reference = await service.applyWorkoutPlanProposal(
      userId,
      {
        title: "Strength base",
        summary: "Swap in a band option.",
        days: [
          {
            weekday: "monday",
            focus: "Strength",
            exercises: [
              {
                pendingExerciseRef: "band-pull-apart",
                snapshot: {
                  name: "Band Pull-Apart",
                  primaryMuscles: ["back"],
                  equipment: ["resistance_band"],
                },
                sets: 3,
                reps: "12",
              },
            ],
          },
        ],
        notes: [],
        pendingExercises: {
          "band-pull-apart": {
            name: "Band Pull-Apart",
            aliases: [],
            primaryMuscles: ["back"],
            secondaryMuscles: [],
            equipment: ["resistance_band"],
            movementPatterns: ["pull"],
            difficulty: "beginner",
            instructions: ["Pull the band apart with control."],
            safetyNotes: ["Use a light band."],
            source: "ai_generated",
          },
        },
      },
      "Swapping to a band-friendly pull.",
      "adapt_workout_plan",
    );

    expect(reference).toBe("workout_revision:rev-pending-1");
    expect(findOrCreateCalled).toBe(true);
    expect(persistedPayload?.days[0]?.exercises[0]).toMatchObject({
      exerciseId: "d1000001-0000-4000-8000-000000000099",
      snapshot: {
        name: "Band Pull-Apart",
        primaryMuscles: ["back"],
        equipment: ["resistance_band"],
      },
    });
    expect(
      (persistedPayload?.days[0]?.exercises[0] as { pendingExerciseRef?: string })
        .pendingExerciseRef,
    ).toBeUndefined();
  });

  it("rejects apply when referenced catalog exercise ids are inaccessible", async () => {
    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => null,
      } as never,
      usersService as never,
      {
        findInaccessibleExerciseIds: async () => [
          "c1000001-0000-4000-8000-000000000099",
        ],
      } as never,
    );

    await expect(
      service.applyWorkoutPlanProposal(
        userId,
        {
          title: "Strength base",
          summary: "Unknown exercise reference.",
          days: [
            {
              weekday: "monday",
              focus: "Strength",
              exercises: [
                {
                  exerciseId: "c1000001-0000-4000-8000-000000000099",
                  snapshot: {
                    name: "Unknown Move",
                    primaryMuscles: ["back"],
                    equipment: ["bodyweight"],
                  },
                  sets: 3,
                  reps: "8",
                },
              ],
            },
          ],
          notes: [],
        },
        "Invalid exercise reference.",
        "adapt_workout_plan",
      ),
    ).rejects.toMatchObject({
      response: {
        validationErrors: [
          'proposedChanges: exerciseId "c1000001-0000-4000-8000-000000000099" was not found in the visible exercise catalog.',
        ],
      },
    });
  });

  it("rejects completion when the session is not found for the user", async () => {
    const service = new WorkoutsService(
      {
        completeSession: async () => null,
      } as never,
      usersService as never,
      exercisesService as never,
    );

    await expect(
      service.completeCurrentSession(auth, "78d40655-b4b5-47b3-b28e-470192e05f04", {
        status: "completed",
        feedback: {},
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("reuses an existing session without rematerializing for the same weekday", async () => {
    let materializeCalled = false;
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
      payload: {
        title: "Strength base",
        summary: "Three training days.",
        days: [
          {
            weekday: "monday",
            focus: "Lower body",
            exercises: [
              {
                exerciseId: "c1000001-0000-4000-8000-000000000099",
                snapshot: { name: "Squat", primaryMuscles: ["quads"], equipment: ["barbell"] },
                sets: 3,
                reps: "8",
              },
            ],
          },
        ],
        notes: [],
      },
      createdAt: new Date("2026-05-20T12:00:00.000Z"),
    };
    const existingSession = {
      id: "78d40655-b4b5-47b3-b28e-470192e05f04",
      userId,
      workoutPlanId: planRow.id,
      workoutPlanRevisionId: revisionRow.id,
      plannedDate: "2026-05-18",
      title: "Strength base — Lower body",
      status: "planned",
      exercises: [
        {
          id: "a1000001-0000-4000-8000-000000000001",
          prescription: { snapshot: { name: "Squat" }, sets: 3, reps: "8" },
          execution: { status: "planned" },
        },
      ],
      feedback: {},
      completedAt: null,
      createdAt: new Date("2026-05-22T12:00:00.000Z"),
      updatedAt: new Date("2026-05-22T12:00:00.000Z"),
    };

    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => planRow,
        findActiveRevisionByPlanId: async () => revisionRow,
        listSessionsByUserAndPlannedDate: async () => [existingSession],
        materializeSession: async () => {
          materializeCalled = true;
          return existingSession;
        },
      } as never,
      usersService as never,
      exercisesService as never,
    );

    const workout = await service.ensureTodayWorkoutSession(auth, "2026-05-18");

    expect(materializeCalled).toBe(false);
    expect(workout?.sessionId).toBe(existingSession.id);
    expect(workout?.weekday).toBe("monday");
  });

  it("returns null when the active plan has no workout for the weekday", async () => {
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
      payload: {
        title: "Strength base",
        summary: "Monday-only plan.",
        days: [
          {
            weekday: "monday",
            focus: "Lower body",
            exercises: [
              {
                exerciseId: "c1000001-0000-4000-8000-000000000099",
                snapshot: { name: "Squat", primaryMuscles: ["quads"], equipment: ["barbell"] },
                sets: 3,
                reps: "8",
              },
            ],
          },
        ],
        notes: [],
      },
      createdAt: new Date("2026-05-20T12:00:00.000Z"),
    };

    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => planRow,
        findActiveRevisionByPlanId: async () => revisionRow,
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
      usersService as never,
      exercisesService as never,
    );

    await expect(service.ensureTodayWorkoutSession(auth, "2026-05-23")).resolves.toBeNull();
  });

  it("throws when starting a workout on a rest day", async () => {
    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => null,
      } as never,
      usersService as never,
      exercisesService as never,
    );

    await expect(
      service.startTodayWorkoutSession(auth, "2026-05-23"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("keeps session planned when only some exercises are completed", async () => {
    const exerciseIdOne = "a1000001-0000-4000-8000-000000000001";
    const exerciseIdTwo = "a1000001-0000-4000-8000-000000000002";
    const sessionRow = {
      id: "78d40655-b4b5-47b3-b28e-470192e05f04",
      userId,
      workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
      plannedDate: "2026-05-18",
      title: "Strength base — Lower body",
      status: "planned",
      exercises: [
        {
          id: exerciseIdOne,
          prescription: { snapshot: { name: "Squat" }, sets: 3, reps: "8" },
          execution: { status: "planned" },
        },
        {
          id: exerciseIdTwo,
          prescription: { snapshot: { name: "Lunge" }, sets: 3, reps: "10" },
          execution: { status: "planned" },
        },
      ],
      feedback: {},
      completedAt: null,
      createdAt: new Date("2026-05-22T12:00:00.000Z"),
      updatedAt: new Date("2026-05-22T12:00:00.000Z"),
    };

    let updatedStatus: string | undefined;

    const service = new WorkoutsService(
      {
        findSessionByUserId: async () => sessionRow,
        updateSessionState: async (
          _resolvedUserId: string,
          _sessionId: string,
          input: { status?: string; exercises?: unknown[] },
        ) => {
          updatedStatus = input.status;
          return {
            ...sessionRow,
            status: input.status ?? sessionRow.status,
            exercises: input.exercises ?? sessionRow.exercises,
          };
        },
      } as never,
      usersService as never,
      exercisesService as never,
    );

    const session = await service.updateSessionExercise(auth, sessionRow.id, exerciseIdOne, {
      status: "completed",
    });

    expect(updatedStatus).toBe("planned");
    expect(session.status).toBe("planned");
    expect(
      (session.exercises[0] as { execution: { status: string } }).execution.status,
    ).toBe("completed");
    expect(
      (session.exercises[1] as { execution: { status: string } }).execution.status,
    ).toBe("planned");
  });

  it("materializes and returns today's workout from the active weekday plan", async () => {
    let materializeCalled = false;
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
      payload: {
        title: "Strength base",
        summary: "Three training days.",
        days: [
          {
            weekday: "monday",
            focus: "Lower body",
            exercises: [
              {
                exerciseId: "c1000001-0000-4000-8000-000000000099",
                snapshot: { name: "Squat", primaryMuscles: ["quads"], equipment: ["barbell"] },
                sets: 3,
                reps: "8",
              },
            ],
          },
        ],
        notes: [],
      },
      createdAt: new Date("2026-05-20T12:00:00.000Z"),
    };

    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => planRow,
        findActiveRevisionByPlanId: async () => revisionRow,
        listSessionsByUserAndPlannedDate: async () => [],
        materializeSession: async (
          resolvedUserId: string,
          workoutPlanId: string,
          workoutPlanRevisionId: string,
          plannedDate: string,
          title: string,
          exercises: unknown[],
        ) => {
          materializeCalled = true;
          expect(resolvedUserId).toBe(userId);
          expect(workoutPlanId).toBe(planRow.id);
          expect(workoutPlanRevisionId).toBe(revisionRow.id);
          expect(plannedDate).toBe("2026-05-18");
          expect(title).toContain("Lower body");
          expect(exercises).toHaveLength(1);

          return {
            id: "78d40655-b4b5-47b3-b28e-470192e05f04",
            userId,
            workoutPlanId,
            workoutPlanRevisionId,
            plannedDate,
            title,
            status: "planned",
            exercises,
            feedback: {},
            completedAt: null,
            createdAt: new Date("2026-05-22T12:00:00.000Z"),
            updatedAt: new Date("2026-05-22T12:00:00.000Z"),
          };
        },
      } as never,
      usersService as never,
      exercisesService as never,
    );

    const workout = await service.ensureTodayWorkoutSession(auth, "2026-05-18");

    expect(materializeCalled).toBe(true);
    expect(workout?.weekday).toBe("monday");
    expect(workout?.exercises).toHaveLength(1);
  });

  it("updates structured exercise execution and completes the session", async () => {
    const exerciseId = "a1000001-0000-4000-8000-000000000001";
    const sessionRow = {
      id: "78d40655-b4b5-47b3-b28e-470192e05f04",
      userId,
      workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
      plannedDate: "2026-05-18",
      title: "Strength base — Lower body",
      status: "planned",
      exercises: [
        {
          id: exerciseId,
          prescription: { snapshot: { name: "Squat" }, sets: 3, reps: "8" },
          execution: { status: "planned" },
        },
      ],
      feedback: {},
      completedAt: null,
      createdAt: new Date("2026-05-22T12:00:00.000Z"),
      updatedAt: new Date("2026-05-22T12:00:00.000Z"),
    };

    let updatedStatus: string | undefined;

    const service = new WorkoutsService(
      {
        findSessionByUserId: async () => sessionRow,
        updateSessionState: async (
          resolvedUserId: string,
          sessionId: string,
          input: { status?: string; exercises?: unknown[] },
        ) => {
          expect(resolvedUserId).toBe(userId);
          expect(sessionId).toBe(sessionRow.id);
          updatedStatus = input.status;
          return {
            ...sessionRow,
            status: input.status ?? sessionRow.status,
            exercises: input.exercises ?? sessionRow.exercises,
            completedAt: new Date("2026-05-18T12:00:00.000Z"),
          };
        },
      } as never,
      usersService as never,
      exercisesService as never,
    );

    const session = await service.updateSessionExercise(auth, sessionRow.id, exerciseId, {
      status: "completed",
    });

    expect(updatedStatus).toBe("completed");
    expect(session.status).toBe("completed");
  });
});
