import { NotFoundException } from "@nestjs/common";
import type { WorkoutPlanProposalChanges } from "@health/types";
import { describe, expect, it, vi } from "vitest";
import { buildSessionCompletionUpdate } from "./workouts.repository.js";
import { WorkoutsService } from "./workouts.service.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const auth = {
  clerkUserId: "clerk-user-1",
  email: "test@example.com",
  displayName: "Test User",
};

const structuredExercise = {
  exerciseId: "b1000001-0000-4000-8000-000000000016",
  snapshot: {
    name: "Goblet Squat",
    primaryMuscles: ["quads", "glutes"],
    equipment: ["dumbbell", "kettlebell"],
  },
  sets: 3,
  reps: "8-10",
  recommendedLoadGuidance: "Choose a challenging but controlled weight.",
  restBetweenSetsSeconds: 90,
} satisfies WorkoutPlanProposalChanges["days"][number]["exercises"][number];

const payload: WorkoutPlanProposalChanges = {
  title: "Strength base",
  summary: "Three repeatable training days.",
  days: [{ weekday: "monday", focus: "Strength", exercises: [structuredExercise] }],
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
  getUserById: async () => ({
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
  findExercisesByIds: async () => [],
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
    modalities: ["strength"],
    difficulty: "beginner",
    instructions: ["Pull with control."],
    safetyNotes: ["Use a light band."],
    media: { refs: [], fallbackLabel: "Demonstration coming soon" },
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
          days: [{ weekday: "monday" as const, focus: "Strength", exercises: [] }],
          notes: [],
        },
        "Starting a new plan.",
      ),
    ).rejects.toMatchObject({
      response: {
        validationErrors: expect.arrayContaining([
          "workout: At least one plan day must include exercises.",
        ]),
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

  it("enriches the active revision payload with catalog metadata", async () => {
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

    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => planRow,
        findActiveRevisionByPlanId: async () => revisionRow,
        listSessionsByPlanId: async () => [],
      } as never,
      usersService as never,
      {
        findInaccessibleExerciseIds: async () => [],
        findExercisesByIds: async (exerciseIds: string[]) =>
          exerciseIds.includes(structuredExercise.exerciseId)
            ? [
                {
                  id: structuredExercise.exerciseId,
                  name: "Goblet Squat",
                  normalizedName: "goblet squat",
                  aliases: [],
                  primaryMuscles: ["quads", "glutes"],
                  secondaryMuscles: [],
                  equipment: ["dumbbell", "kettlebell"],
                  movementPatterns: ["squat"],
                  modalities: ["strength"],
                  difficulty: "intermediate",
                  instructions: ["Keep chest tall."],
                  safetyNotes: ["Stop if knee discomfort increases."],
                  media: { refs: [], fallbackLabel: "Demonstration coming soon" },
                  source: "system_seed",
                  validationStatus: "validated",
                  status: "active",
                  userId: null,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ]
            : [],
      } as never,
    );

    const result = await service.getCurrentActivePlan(auth);

    expect(result.activeRevision?.payload.days[0]?.exercises[0]).toMatchObject({
      catalog: {
        source: "catalog",
        name: "Goblet Squat",
        instructions: ["Keep chest tall."],
        safetyNotes: ["Stop if knee discomfort increases."],
      },
    });
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
            modalities: ["strength"],
            difficulty: "beginner",
            instructions: ["Pull with control."],
            safetyNotes: ["Use a light band."],
            media: { refs: [], fallbackLabel: "Demonstration coming soon" },
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
            modalities: ["strength"],
            difficulty: "beginner",
            instructions: ["Pull the band apart with control."],
            safetyNotes: ["Use a light band."],
            source: "ai_generated",
          },
        },
      },
      "Swapping to a band-friendly pull.",
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
      ),
    ).rejects.toMatchObject({
      response: {
        validationErrors: [
          'proposedChanges: exerciseId "c1000001-0000-4000-8000-000000000099" was not found in the visible exercise catalog.',
        ],
      },
    });
  });

  it("rejects apply payloads with free-form string exercises", async () => {
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
          summary: "Legacy string day.",
          days: [{ weekday: "monday", focus: "Strength", exercises: ["Squat"] }],
          notes: [],
        },
        "Attempted free-form apply.",
      ),
    ).rejects.toMatchObject({
      response: {
        validationErrors: expect.arrayContaining([
          expect.stringMatching(/structured catalog-backed exercises/),
        ]),
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

  it("enriches Today workout exercises with catalog metadata", async () => {
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
            exercises: [structuredExercise],
          },
        ],
        notes: [],
      },
      createdAt: new Date("2026-05-20T12:00:00.000Z"),
    };
    const materializedExercises = [
      {
        id: "a1000001-0000-4000-8000-000000000001",
        exerciseId: structuredExercise.exerciseId,
        prescription: {
          snapshot: structuredExercise.snapshot,
          sets: structuredExercise.sets,
          reps: structuredExercise.reps,
        },
        execution: { status: "planned" },
      },
    ];

    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => planRow,
        findActiveRevisionByPlanId: async () => revisionRow,
        listSessionsByUserAndPlannedDate: async () => [],
        materializeSession: async (
          _resolvedUserId: string,
          _workoutPlanId: string,
          _workoutPlanRevisionId: string,
          plannedDate: string,
          title: string,
          exercises: unknown[],
        ) => ({
          id: "78d40655-b4b5-47b3-b28e-470192e05f04",
          userId,
          workoutPlanId: planRow.id,
          workoutPlanRevisionId: revisionRow.id,
          plannedDate,
          title,
          status: "planned",
          exercises,
          feedback: {},
          completedAt: null,
          createdAt: new Date("2026-05-22T12:00:00.000Z"),
          updatedAt: new Date("2026-05-22T12:00:00.000Z"),
        }),
      } as never,
      usersService as never,
      {
        findInaccessibleExerciseIds: async () => [],
        findExercisesByIds: async (exerciseIds: string[]) =>
          exerciseIds.includes(structuredExercise.exerciseId)
            ? [
                {
                  id: structuredExercise.exerciseId,
                  name: "Goblet Squat",
                  normalizedName: "goblet squat",
                  aliases: [],
                  primaryMuscles: ["quads", "glutes"],
                  secondaryMuscles: [],
                  equipment: ["dumbbell", "kettlebell"],
                  movementPatterns: ["squat"],
                  modalities: ["strength"],
                  difficulty: "intermediate",
                  instructions: ["Keep chest tall."],
                  safetyNotes: ["Stop if knee discomfort increases."],
                  media: { refs: [], fallbackLabel: "Demonstration coming soon" },
                  source: "system_seed",
                  validationStatus: "validated",
                  status: "active",
                  userId: null,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              ]
            : [],
      } as never,
    );

    const workout = await service.ensureTodayWorkoutSession(auth, "2026-05-18");

    expect(workout?.exercises[0]?.catalog).toMatchObject({
      source: "catalog",
      name: "Goblet Squat",
      modalities: ["strength"],
    });
    expect(materializedExercises[0]?.prescription.snapshot.name).toBe("Goblet Squat");
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

  it("updates session execution without creating workout plan revisions", async () => {
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

    let appendRevisionCalled = false;
    let createPlanCalled = false;

    const service = new WorkoutsService(
      {
        findSessionByUserId: async () => sessionRow,
        updateSessionState: async (
          _resolvedUserId: string,
          _sessionId: string,
          input: { status?: string; exercises?: unknown[] },
        ) => ({
          ...sessionRow,
          status: input.status ?? sessionRow.status,
          exercises: input.exercises ?? sessionRow.exercises,
        }),
        appendRevision: async () => {
          appendRevisionCalled = true;
          return { id: "should-not-run" };
        },
        createPlanWithRevision: async () => {
          createPlanCalled = true;
          return { revision: { id: "should-not-run" } };
        },
      } as never,
      usersService as never,
      exercisesService as never,
    );

    await service.updateSessionExercise(auth, sessionRow.id, exerciseId, {
      status: "completed",
      perceivedEffort: 7,
      notes: "Solid set.",
    });

    expect(appendRevisionCalled).toBe(false);
    expect(createPlanCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 6: calorie-on-workout — revision preservation
// ---------------------------------------------------------------------------

describe("WorkoutsService — calorie revision preservation (Phase 6)", () => {
  /**
   * When an adapt_workout_plan proposal carries estimatedSessionCalorieBurn +
   * calorieEstimateProvenance, the accepted payload that is passed to
   * appendRevision / createPlanWithRevision MUST include both fields unchanged.
   * These tests verify that the apply path does not strip or reset the calorie fields.
   */

  const payloadWithCalorie: WorkoutPlanProposalChanges = {
    title: "Recovery plan",
    summary: "Lighter session after fatigue signals.",
    days: [
      {
        weekday: "monday",
        focus: "Recovery",
        exercises: [
          {
            exerciseId: "b1000001-0000-4000-8000-000000000016",
            snapshot: {
              name: "Goblet Squat",
              primaryMuscles: ["quads", "glutes"],
              equipment: ["dumbbell", "kettlebell"],
            },
            sets: 3,
            reps: "8-10",
            restBetweenSetsSeconds: 90,
          },
        ],
      },
    ],
    notes: [],
    estimatedSessionCalorieBurn: 280,
    calorieEstimateProvenance: "workout_llm",
  };

  it("carries estimatedSessionCalorieBurn and provenance into a new revision on adapt", async () => {
    let persistedPayload: WorkoutPlanProposalChanges | undefined;

    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => ({ id: "plan-calorie-1" }),
        appendRevision: async (
          _planId: string,
          nextPayload: WorkoutPlanProposalChanges,
        ) => {
          persistedPayload = nextPayload;
          return { id: "rev-calorie-1" };
        },
      } as never,
      usersService as never,
      exercisesService as never,
    );

    const reference = await service.applyWorkoutPlanProposal(
      userId,
      payloadWithCalorie,
      "Adapting plan with calorie estimate from workout LLM.",
    );

    expect(reference).toBe("workout_revision:rev-calorie-1");
    expect(persistedPayload?.estimatedSessionCalorieBurn).toBe(280);
    expect(persistedPayload?.calorieEstimateProvenance).toBe("workout_llm");
  });

  it("carries estimatedSessionCalorieBurn and provenance into a brand-new plan revision", async () => {
    let persistedPayload: WorkoutPlanProposalChanges | undefined;

    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => null,
        createPlanWithRevision: async (
          _userId: string,
          nextPayload: WorkoutPlanProposalChanges,
        ) => {
          persistedPayload = nextPayload;
          return { revision: { id: "rev-calorie-2" } };
        },
      } as never,
      usersService as never,
      exercisesService as never,
    );

    const reference = await service.applyWorkoutPlanProposal(
      userId,
      payloadWithCalorie,
      "Creating plan with calorie estimate.",
    );

    expect(reference).toBe("workout_revision:rev-calorie-2");
    expect(persistedPayload?.estimatedSessionCalorieBurn).toBe(280);
    expect(persistedPayload?.calorieEstimateProvenance).toBe("workout_llm");
  });

  it("creates a revision WITHOUT calorie fields when none were in the proposal", async () => {
    let persistedPayload: WorkoutPlanProposalChanges | undefined;

    const payloadNoCalorie: WorkoutPlanProposalChanges = {
      ...payloadWithCalorie,
      estimatedSessionCalorieBurn: undefined,
      calorieEstimateProvenance: undefined,
    };

    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => ({ id: "plan-calorie-3" }),
        appendRevision: async (
          _planId: string,
          nextPayload: WorkoutPlanProposalChanges,
        ) => {
          persistedPayload = nextPayload;
          return { id: "rev-calorie-3" };
        },
      } as never,
      usersService as never,
      exercisesService as never,
    );

    await service.applyWorkoutPlanProposal(
      userId,
      payloadNoCalorie,
      "Adaptation without calorie estimate.",
    );

    expect(persistedPayload?.estimatedSessionCalorieBurn).toBeUndefined();
    expect(persistedPayload?.calorieEstimateProvenance).toBeUndefined();
  });

  it("carries user_manual provenance unmodified into the revision", async () => {
    let persistedPayload: WorkoutPlanProposalChanges | undefined;

    const payloadUserManual: WorkoutPlanProposalChanges = {
      ...payloadWithCalorie,
      estimatedSessionCalorieBurn: 450,
      calorieEstimateProvenance: "user_manual",
    };

    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => ({ id: "plan-calorie-4" }),
        appendRevision: async (
          _planId: string,
          nextPayload: WorkoutPlanProposalChanges,
        ) => {
          persistedPayload = nextPayload;
          return { id: "rev-calorie-4" };
        },
      } as never,
      usersService as never,
      exercisesService as never,
    );

    await service.applyWorkoutPlanProposal(
      userId,
      payloadUserManual,
      "User manually set calorie estimate.",
    );

    expect(persistedPayload?.estimatedSessionCalorieBurn).toBe(450);
    expect(persistedPayload?.calorieEstimateProvenance).toBe("user_manual");
  });

  it("does NOT strip the calorie estimate when provenance is also present (apply path passes them through)", async () => {
    // The calorie pair constraint (calorie requires provenance and vice-versa) is enforced
    // by ProposalValidationService.getChangesSchemaForIntent → getWorkoutProposalDomainErrors
    // BEFORE applyWorkoutPlanProposal is ever called.
    // WorkoutsService.applyWorkoutPlanProposal is the "apply already-validated proposal" path
    // and does not re-validate the pair constraint — it only calls getWorkoutPlanDomainErrors.
    // This test verifies that valid calorie fields flow through untouched.
    let persistedPayload: WorkoutPlanProposalChanges | undefined;

    const service = new WorkoutsService(
      {
        findActivePlanByUserId: async () => ({ id: "plan-calorie-5" }),
        appendRevision: async (
          _planId: string,
          nextPayload: WorkoutPlanProposalChanges,
        ) => {
          persistedPayload = nextPayload;
          return { id: "rev-calorie-5" };
        },
      } as never,
      usersService as never,
      exercisesService as never,
    );

    await service.applyWorkoutPlanProposal(
      userId,
      payloadWithCalorie,
      "Apply already-validated calorie proposal.",
    );

    // Both fields must survive the apply path unchanged.
    expect(persistedPayload?.estimatedSessionCalorieBurn).toBe(280);
    expect(persistedPayload?.calorieEstimateProvenance).toBe("workout_llm");
  });

  // ---------------------------------------------------------------------------
  // applyLogWorkoutActivityProposal — trusted ratePerHour governs persisted calories.
  // Verifies that:
  //   1. estimatedCalories is always re-derived from ratePerHour × durationMinutes / 60
  //      (not taken from the advisory estimatedCalories on the payload).
  //   2. A tampered client ratePerHour that survived schema parsing would be re-derived —
  //      but the pinning in proposals.service ensures the rate is already the trusted
  //      stored value before applyLogWorkoutActivityProposal runs.
  //   3. NO revision is created (insertAdHocSession is called; appendRevision is NOT).
  // ---------------------------------------------------------------------------

  it("applyLogWorkoutActivityProposal: estimatedCalories is recomputed from ratePerHour * durationMinutes / 60", async () => {
    // The advisory estimatedCalories may differ from the re-derived value by up to 2000 kcal
    // (domain validation tolerance). This test uses an advisory value that differs from the
    // stored value to confirm the re-derivation.
    // Stored: rate=300, duration=90 → expected persisted = round(300 * 90 / 60) = 450.
    // Advisory estimatedCalories=480 is close enough to pass domain validation (|480-450|=30 ≤ 2000)
    // but differs from the re-derived value, proving the apply path re-derives.
    let insertedCalories: number | undefined;
    let appendRevisionCalled = false;

    const service = new WorkoutsService(
      {
        insertAdHocSession: async (
          _userId: string,
          payload: {
            title: string;
            activityType: string;
            performedAt: Date;
            plannedDate: string;
            estimatedCalories: number;
          },
        ) => {
          insertedCalories = payload.estimatedCalories;
          return {
            id: "session-adhoc-1",
            userId,
            workoutPlanId: null,
            workoutPlanRevisionId: null,
            plannedDate: payload.plannedDate,
            title: payload.title,
            status: "completed",
            exercises: [],
            feedback: {},
            completedAt: payload.performedAt,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
        appendRevision: async () => {
          appendRevisionCalled = true;
          return { id: "should-never-be-called" };
        },
      } as never,
      usersService as never,
      exercisesService as never,
    );

    // ratePerHour=300, durationMinutes=90 → recomputed = round(300 * 90 / 60) = 450.
    // Advisory estimatedCalories=480 (within domain validation tolerance) must be replaced.
    const reference = await service.applyLogWorkoutActivityProposal(
      userId,
      {
        activityType: "volleyball",
        title: "Volleyball session",
        durationMinutes: 90,
        performedAt: "2026-06-04T16:00:00.000Z",
        ratePerHour: 300,
        estimatedCalories: 480, // advisory differs from computed 450 — must be overwritten
      },
      "Logged from message",
    );

    expect(reference).toMatch(/^workout_session:/);
    expect(insertedCalories).toBe(450);          // round(300 * 90 / 60) — NOT 480
    expect(appendRevisionCalled).toBe(false);    // NO revision created
  });

  it("applyLogWorkoutActivityProposal: advisory estimatedCalories is ignored when ratePerHour is present", async () => {
    // applyLogWorkoutActivityProposal always uses ratePerHour to re-derive calories.
    // The advisory estimatedCalories field is never trusted directly.
    // In production, proposals.service pins ratePerHour to the stored trusted value before
    // calling applyLogWorkoutActivityProposal, so there is no client inflation path.
    // This test uses a payload where estimatedCalories differs from the ratePerHour recompute
    // (within domain tolerance) to verify re-derivation is used.
    let insertedCalories: number | undefined;

    const service = new WorkoutsService(
      {
        insertAdHocSession: async (
          _userId: string,
          payload: { estimatedCalories: number; title: string; activityType: string; performedAt: Date; plannedDate: string },
        ) => {
          insertedCalories = payload.estimatedCalories;
          return {
            id: "session-adhoc-tamper",
            userId,
            workoutPlanId: null,
            workoutPlanRevisionId: null,
            plannedDate: payload.plannedDate,
            title: payload.title,
            status: "completed",
            exercises: [],
            feedback: {},
            completedAt: payload.performedAt,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        },
      } as never,
      usersService as never,
      exercisesService as never,
    );

    // ratePerHour=300, durationMinutes=60 → recomputed = round(300 * 60 / 60) = 300.
    // Advisory estimatedCalories=450 is within domain tolerance (|450-300|=150 ≤ 2000)
    // but differs from the re-derived value, confirming re-derivation wins.
    await service.applyLogWorkoutActivityProposal(
      userId,
      {
        activityType: "running",
        title: "Running session",
        durationMinutes: 60,
        performedAt: "2026-06-04T08:00:00.000Z",
        ratePerHour: 300,
        estimatedCalories: 450, // advisory — closer than 2000 to 300 (domain valid)
      },
      "Logged from message",
    );

    // round(300 * 60 / 60) = 300 — NOT the advisory 450
    expect(insertedCalories).toBe(300);
  });

  it("applyLogWorkoutActivityProposal: creates NO workout plan revision", async () => {
    let appendRevisionCalled = false;
    let createPlanCalled = false;

    const service = new WorkoutsService(
      {
        insertAdHocSession: async (
          _userId: string,
          payload: { estimatedCalories: number; title: string; activityType: string; performedAt: Date; plannedDate: string },
        ) => ({
          id: "session-no-revision",
          userId,
          workoutPlanId: null,
          workoutPlanRevisionId: null,
          plannedDate: payload.plannedDate,
          title: payload.title,
          status: "completed",
          exercises: [],
          feedback: {},
          completedAt: payload.performedAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        appendRevision: async () => {
          appendRevisionCalled = true;
          return { id: "rev-should-not-exist" };
        },
        createPlanWithRevision: async () => {
          createPlanCalled = true;
          return { revision: { id: "plan-should-not-exist" } };
        },
      } as never,
      usersService as never,
      exercisesService as never,
    );

    const reference = await service.applyLogWorkoutActivityProposal(
      userId,
      {
        activityType: "yoga",
        title: "Yoga session",
        durationMinutes: 45,
        performedAt: "2026-06-04T07:00:00.000Z",
        ratePerHour: 200,
        estimatedCalories: 150,
      },
      "Logged yoga session",
    );

    expect(reference).toMatch(/^workout_session:/);
    expect(appendRevisionCalled).toBe(false);
    expect(createPlanCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C2: applyLogWorkoutActivityProposal — plannedDate uses user's LOCAL timezone
// ---------------------------------------------------------------------------

describe("WorkoutsService — applyLogWorkoutActivityProposal plannedDate timezone (C2)", () => {
  /**
   * A performedAt of 2026-06-04T23:30:00-07:00 (America/Los_Angeles) is
   * 2026-06-05T06:30:00Z in UTC.  The UTC .slice(0,10) would yield "2026-06-05"
   * (next day), but the user's local date is still "2026-06-04".
   * The service must derive the LOCAL calendar date via formatIsoDateInTimezone.
   */

  function makeAdHocInsertSpy(capturedPayload: { plannedDate?: string }) {
    return async (
      _uid: string,
      payload: {
        title: string;
        activityType: string;
        performedAt: Date;
        plannedDate: string;
        estimatedCalories: number;
      },
    ) => {
      capturedPayload.plannedDate = payload.plannedDate;
      return {
        id: "session-tz-1",
        userId,
        workoutPlanId: null,
        workoutPlanRevisionId: null,
        plannedDate: payload.plannedDate,
        title: payload.title,
        status: "completed",
        exercises: [],
        feedback: {},
        completedAt: payload.performedAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    };
  }

  it("derives plannedDate in a negative-UTC-offset timezone (America/Los_Angeles 23:30 local = next UTC day)", async () => {
    const captured: { plannedDate?: string } = {};

    // America/Los_Angeles is UTC-7 in summer (PDT).
    // 2026-06-04T23:30:00 PDT = 2026-06-05T06:30:00 UTC.
    // UTC .slice(0,10) = "2026-06-05" (wrong), local date = "2026-06-04" (correct).
    const performedAtUtc = "2026-06-05T06:30:00.000Z";

    const laUsersService = {
      resolveFromAuth: async () => ({
        id: userId,
        email: auth.email,
        displayName: auth.displayName,
        timezone: "America/Los_Angeles",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      getUserById: async () => ({
        id: userId,
        email: auth.email,
        displayName: auth.displayName,
        timezone: "America/Los_Angeles",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    };

    const service = new WorkoutsService(
      {
        insertAdHocSession: makeAdHocInsertSpy(captured),
      } as never,
      laUsersService as never,
      exercisesService as never,
    );

    const reference = await service.applyLogWorkoutActivityProposal(
      userId,
      {
        activityType: "volleyball",
        title: "Late evening volleyball",
        durationMinutes: 60,
        performedAt: performedAtUtc,
        ratePerHour: 300,
        estimatedCalories: 300,
      },
      "Logged from chat",
    );

    expect(reference).toMatch(/^workout_session:/);
    // Must be the LOCAL date in LA, NOT the UTC next-day date.
    expect(captured.plannedDate).toBe("2026-06-04");
    expect(captured.plannedDate).not.toBe("2026-06-05");
  });

  it("the local-date plannedDate matches Today for that date in America/Los_Angeles", async () => {
    // This verifies the Today surface can match the session by plannedDate.
    // The session's plannedDate must equal formatIsoDateInTimezone("America/Los_Angeles", performedAt).
    // We test this by asserting the stored plannedDate ("2026-06-04") equals what
    // the Today service would use as "today" for a user in LA at that same moment.
    const captured: { plannedDate?: string } = {};
    const performedAtUtc = "2026-06-05T06:30:00.000Z"; // 23:30 PDT on June 4th

    const laUsersService = {
      resolveFromAuth: async () => ({
        id: userId,
        email: auth.email,
        displayName: null,
        timezone: "America/Los_Angeles",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      getUserById: async () => ({
        id: userId,
        email: auth.email,
        displayName: null,
        timezone: "America/Los_Angeles",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    };

    const service = new WorkoutsService(
      { insertAdHocSession: makeAdHocInsertSpy(captured) } as never,
      laUsersService as never,
      exercisesService as never,
    );

    await service.applyLogWorkoutActivityProposal(
      userId,
      {
        activityType: "running",
        title: "Evening run",
        durationMinutes: 45,
        performedAt: performedAtUtc,
        ratePerHour: 360,
        estimatedCalories: 270,
      },
      "Logged from chat",
    );

    // The Today service queries sessions by plannedDate == user's today in their timezone.
    // For a user in LA at 23:30 PDT on June 4th, their "today" is "2026-06-04".
    // The stored plannedDate must match so the session appears in Today.
    const { formatIsoDateInTimezone } = await import("@health/types");
    const expectedTodayDateForLa = formatIsoDateInTimezone(
      "America/Los_Angeles",
      new Date(performedAtUtc),
    );

    expect(captured.plannedDate).toBe(expectedTodayDateForLa);
    expect(captured.plannedDate).toBe("2026-06-04");
  });

  it("falls back to UTC when getUserById returns null", async () => {
    const captured: { plannedDate?: string } = {};

    // 2026-06-05T00:30:00Z → UTC date is "2026-06-05" (same as UTC fallback).
    const performedAtUtc = "2026-06-05T00:30:00.000Z";

    const nullUsersService = {
      resolveFromAuth: async () => ({
        id: userId,
        email: auth.email,
        displayName: null,
        timezone: "UTC",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      getUserById: async () => null,
    };

    const service = new WorkoutsService(
      { insertAdHocSession: makeAdHocInsertSpy(captured) } as never,
      nullUsersService as never,
      exercisesService as never,
    );

    await service.applyLogWorkoutActivityProposal(
      userId,
      {
        activityType: "yoga",
        title: "Morning yoga",
        durationMinutes: 30,
        performedAt: performedAtUtc,
        ratePerHour: 200,
        estimatedCalories: 100,
      },
      "Logged from chat",
    );

    // UTC fallback: 2026-06-05T00:30Z → UTC date = "2026-06-05"
    expect(captured.plannedDate).toBe("2026-06-05");
  });
});
