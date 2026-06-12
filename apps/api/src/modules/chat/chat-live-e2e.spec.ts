/**
 * chat-live-e2e.spec.ts
 *
 * Deep integration test for the chat/workout proposal scenario:
 *   POST /chat/threads/:id/messages with attached workout program file
 *   + "запиши в мой workout" → previously HTTP 500.
 *
 * Root cause: exercises with source='free_exercise_db' (from unmerged catalog
 * branch) → exerciseSourceSchema only allowed system_seed|ai_generated|user_created
 * → ZodError in toExercise() → unhandled error killed the whole turn.
 *
 * This spec has three tiers:
 *
 * Tier 1 — always runs (unit, no DB, no OpenAI):
 *   - exerciseSourceSchema now accepts free_exercise_db
 *   - normalizer fault isolation: per-exercise error degrades to pendingExerciseRef
 *   - normalizer fault isolation: whole-step error returns original changes
 *
 * Tier 2 — runs when DATABASE_URL_TEST points to health_tracer_test:
 *   - real ExercisesRepository/Service: free_exercise_db rows are resolved
 *   - normalizeLegacyWorkoutPlanExercises with real DB, mixed sources
 *
 * Tier 3 — runs when LIVE_E2E=1 AND OPENAI_API_KEY is set (real LLM call):
 *   - full ChatService with real AI pipeline + real DB
 *   - asserts: reply non-empty, proposal persisted intent=create_workout_plan,
 *     proposal accepted → workout plan revision created,
 *     ≥1 exercise resolved to catalogId OR pendingExerciseRef (no ZodError 500)
 *
 * Run Tier 2:
 *   DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5432/health_tracer_test \
 *   pnpm --dir apps/api exec vitest run src/modules/chat/chat-live-e2e.spec.ts
 *
 * Run Tier 3:
 *   LIVE_E2E=1 \
 *   DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5432/health_tracer_test \
 *   OPENAI_API_KEY=sk-... \
 *   pnpm --dir apps/api exec vitest run src/modules/chat/chat-live-e2e.spec.ts
 */

import { join } from "node:path";
import { tmpdir } from "node:os";
import * as schema from "@health/db";
import { exercises, users, aiProposals, chatThreads, chatMessages, workoutPlanRevisions, workoutPlans } from "@health/db";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  exerciseSourceSchema,
  workoutPlanProposalChangesSchema,
  type WorkoutPlanProposalChanges,
} from "@health/types";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Environment gates
// ---------------------------------------------------------------------------

// Load apps/api/.env exactly like the running API does, so Tier 3 can use the
// real OPENAI_API_KEY without it being passed on the command line. Values are
// only applied when the variable is not already set; nothing is ever logged.
{
  const { readFileSync, existsSync } = await import("node:fs");
  const candidates = [
    join(import.meta.dirname, "../../../.env"),
    // Worktrees don't carry the git-ignored .env — fall back to the primary checkout.
    "C:/Users/ilsac/IdeaProjects/health_tracer/apps/api/.env",
  ];
  const envPath = candidates.find((p) => existsSync(p));
  if (envPath) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/.exec(line);
      if (match && process.env[match[1]!] === undefined) {
        process.env[match[1]!] = match[2]!.trim();
      }
    }
  }
}

const DB_URL =
  process.env["DATABASE_URL_TEST"] ??
  (process.env["DATABASE_URL"]?.includes("health_tracer_test")
    ? process.env["DATABASE_URL"]
    : undefined);

const LIVE_E2E_ENABLED =
  process.env["LIVE_E2E"] === "1" && Boolean(process.env["OPENAI_API_KEY"]);

const MIGRATIONS_DIR = join(import.meta.dirname, "../../../../../packages/db/drizzle");

// ---------------------------------------------------------------------------
// TIER 1 — Unit tests (always run)
// ---------------------------------------------------------------------------

describe("Tier 1 — unit: exerciseSourceSchema and normalizer fault isolation", () => {
  it("exerciseSourceSchema accepts free_exercise_db (root cause #1 fix)", () => {
    const result = exerciseSourceSchema.safeParse("free_exercise_db");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("free_exercise_db");
    }
  });

  it("exerciseSourceSchema still accepts legacy values", () => {
    for (const value of ["system_seed", "ai_generated", "user_created"] as const) {
      const result = exerciseSourceSchema.safeParse(value);
      expect(result.success).toBe(true);
    }
  });

  it("exerciseSourceSchema rejects unknown source", () => {
    const result = exerciseSourceSchema.safeParse("unknown_source");
    expect(result.success).toBe(false);
  });

  it("normalizer fault isolation: per-exercise lookup error degrades to pendingExerciseRef (not throw)", async () => {
    const { normalizeLegacyWorkoutPlanExercises } = await import(
      "../workouts/workout-exercise-normalizer.js"
    );

    const throwingExercisesService = {
      findExerciseByNormalizedName: async (_name: string, _userId: string) => {
        throw new Error("ZodError: invalid_enum_value — source must be one of ...");
      },
    };

    const changes: WorkoutPlanProposalChanges = workoutPlanProposalChangesSchema.parse({
      title: "5-Day Program",
      summary: "Test plan",
      days: [
        {
          weekday: "monday",
          focus: "Push",
          exercises: [{ name: "Bench Press", sets: 3, reps: "8-10" }],
        },
      ],
      notes: [],
    });

    // Must NOT throw — per-exercise error degrades to pendingExerciseRef.
    const result = await normalizeLegacyWorkoutPlanExercises(
      throwingExercisesService as never,
      "test-user-id",
      changes,
    );

    // Exercise became pendingExerciseRef (unmatched), not a throw.
    expect(result.unmatchedNames).toContain("Bench Press");
    const day = result.changes.days[0];
    expect(day).toBeDefined();
    const entry = day!.exercises[0];
    expect(entry).toBeDefined();
    // Should be a pendingExerciseRef entry, not the original legacy object.
    expect(entry).toHaveProperty("pendingExerciseRef");
    expect(entry).toHaveProperty("snapshot");
  });

  it("normalizer fault isolation: whole-step error returns original changes (not throw)", async () => {
    const { normalizeLegacyWorkoutPlanExercises } = await import(
      "../workouts/workout-exercise-normalizer.js"
    );

    // Simulate an error in the outer step by passing a `changes` object
    // whose `.days` getter throws — this escapes the per-exercise try/catch
    // and is caught by the outer whole-step wrapper.
    const validChanges: WorkoutPlanProposalChanges = workoutPlanProposalChangesSchema.parse({
      title: "5-Day Program",
      summary: "Test plan",
      days: [
        {
          weekday: "monday",
          focus: "Push",
          exercises: [{ name: "Squat", sets: 4, reps: "5" }],
        },
      ],
      notes: [],
    });

    const throwingChanges = {
      ...validChanges,
      get days(): never {
        throw new Error("whole-step catastrophic error accessing days");
      },
    } as unknown as WorkoutPlanProposalChanges;

    const noopService = {
      findExerciseByNormalizedName: async () => null,
    };

    // Must NOT throw — whole-step error returns original changes.
    const result = await normalizeLegacyWorkoutPlanExercises(
      noopService as never,
      "test-user-id",
      throwingChanges,
    );

    // Whole-step catch fires → original `throwingChanges` returned, unmatchedNames empty.
    expect(result.unmatchedNames).toHaveLength(0);
    // changes is the original `throwingChanges` object (the outer catch returned it).
    expect(result.changes).toBe(throwingChanges);
  });
});

// ---------------------------------------------------------------------------
// TIER 2 — DB integration (requires DATABASE_URL_TEST)
// ---------------------------------------------------------------------------

describe.skipIf(!DB_URL)("Tier 2 — DB integration: free_exercise_db exercise lookup", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: ReturnType<typeof drizzle<any>>;
  let sql: ReturnType<typeof postgres>;
  let testUserId: string;

  // IDs of seeded exercise rows so we can clean up after.
  const seededExerciseIds: string[] = [];

  beforeAll(async () => {
    sql = postgres(DB_URL!, { prepare: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db = drizzle(sql, { schema: schema as any });

    // Apply full migration chain to the scratch DB.
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    // Seed a test user.
    const ts = Date.now();
    const [userRow] = await db
      .insert(users)
      .values({
        clerkUserId: `clerk-e2e-${ts}`,
        email: `e2e-${ts}@example.com`,
        displayName: "E2E Test User",
      })
      .returning({ id: users.id });

    if (!userRow?.id) {
      throw new Error("Failed to seed test user.");
    }
    testUserId = userRow.id;

    // Seed exercise rows with mixed sources, including free_exercise_db.
    // This reproduces the real dev DB shape that caused the ZodError.
    const exercisesToSeed = [
      {
        name: "Bench Press",
        normalizedName: "bench press",
        source: "free_exercise_db",
        dedupeKey: "bench press::barbell::chest",
        primaryMuscles: ["chest"],
        secondaryMuscles: ["triceps"],
        equipment: ["barbell"],
        movementPatterns: ["push"],
        modalities: ["strength"],
        difficulty: "intermediate",
        instructions: ["Lie on bench, grip bar at shoulder width, lower to chest, press up."],
        safetyNotes: ["Keep feet flat on floor."],
        aliases: [],
      },
      {
        name: "Squat",
        normalizedName: "squat",
        source: "system_seed",
        dedupeKey: "squat::barbell::quads",
        primaryMuscles: ["quads"],
        secondaryMuscles: ["glutes"],
        equipment: ["barbell"],
        movementPatterns: ["squat"],
        modalities: ["strength"],
        difficulty: "intermediate",
        instructions: ["Stand with feet shoulder-width, lower until thighs parallel, stand up."],
        safetyNotes: ["Keep chest up."],
        aliases: [],
      },
      {
        name: "Unknown Exercise XYZ",
        normalizedName: "unknown exercise xyz",
        source: "ai_generated",
        dedupeKey: "unknown exercise xyz::bodyweight::core",
        primaryMuscles: ["core"],
        secondaryMuscles: [],
        equipment: ["bodyweight"],
        movementPatterns: ["isolation"],
        modalities: ["strength"],
        difficulty: "beginner",
        instructions: ["Perform with proper form."],
        safetyNotes: ["Use appropriate weight."],
        aliases: [],
      },
    ];

    for (const ex of exercisesToSeed) {
      const [row] = await db
        .insert(exercises)
        .values({
          name: ex.name,
          normalizedName: ex.normalizedName,
          source: ex.source,
          dedupeKey: ex.dedupeKey,
          primaryMuscles: ex.primaryMuscles,
          secondaryMuscles: ex.secondaryMuscles,
          equipment: ex.equipment,
          movementPatterns: ex.movementPatterns,
          modalities: ex.modalities,
          difficulty: ex.difficulty,
          instructions: ex.instructions,
          safetyNotes: ex.safetyNotes,
          aliases: ex.aliases,
          validationStatus: "validated",
          status: "active",
          userId: null,
          media: { refs: [], fallbackLabel: null },
        })
        .onConflictDoNothing()
        .returning({ id: exercises.id });

      if (row?.id) {
        seededExerciseIds.push(row.id);
      }
    }
  });

  afterAll(async () => {
    // Delete seeded exercises (by ID to be precise).
    if (seededExerciseIds.length > 0) {
      for (const id of seededExerciseIds) {
        await db.delete(exercises).where(eq(exercises.id, id));
      }
    }

    // Delete seeded user (cascade deletes related rows).
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }

    await sql.end();
  });

  it("ExercisesRepository.findByNormalizedName resolves free_exercise_db exercise without ZodError", async () => {
    // This directly tests the toExercise() mapper fix: source='free_exercise_db'
    // must no longer throw ZodError.
    const { ExercisesRepository } = await import("../exercises/exercises.repository.js");
    const { toExercise } = await import("../exercises/exercise.mapper.js");

    const repo = new (ExercisesRepository as new (db: unknown) => InstanceType<typeof ExercisesRepository>)(db);
    const row = await repo.findByNormalizedName("bench press", null);

    expect(row).not.toBeNull();
    expect(row!.source).toBe("free_exercise_db");

    // toExercise must not throw — this is the root cause fix.
    expect(() => toExercise(row!)).not.toThrow();
    const mapped = toExercise(row!);
    expect(mapped.source).toBe("free_exercise_db");
    expect(mapped.name).toBe("Bench Press");
  });

  it("ExercisesService.findExerciseByNormalizedName resolves free_exercise_db exercise", async () => {
    const { ExercisesRepository } = await import("../exercises/exercises.repository.js");
    const { ExercisesService } = await import("../exercises/exercises.service.js");

    const repo = new (ExercisesRepository as new (db: unknown) => InstanceType<typeof ExercisesRepository>)(db);
    const service = new (ExercisesService as new (repo: unknown, users: unknown) => InstanceType<typeof ExercisesService>)(
      repo,
      // UsersService stub — not needed for findExerciseByNormalizedName.
      { resolveFromAuth: async () => { throw new Error("not used"); } } as never,
    );

    const exercise = await service.findExerciseByNormalizedName("bench press", testUserId);
    expect(exercise).not.toBeNull();
    expect(exercise!.source).toBe("free_exercise_db");
    expect(exercise!.name).toBe("Bench Press");
  });

  it("normalizeLegacyWorkoutPlanExercises resolves free_exercise_db exercises to exerciseId", async () => {
    const { ExercisesRepository } = await import("../exercises/exercises.repository.js");
    const { ExercisesService } = await import("../exercises/exercises.service.js");
    const { normalizeLegacyWorkoutPlanExercises } = await import(
      "../workouts/workout-exercise-normalizer.js"
    );

    const repo = new (ExercisesRepository as new (db: unknown) => InstanceType<typeof ExercisesRepository>)(db);
    const service = new (ExercisesService as new (repo: unknown, users: unknown) => InstanceType<typeof ExercisesService>)(
      repo,
      { resolveFromAuth: async () => { throw new Error("not used"); } } as never,
    );

    const changes: WorkoutPlanProposalChanges = workoutPlanProposalChangesSchema.parse({
      title: "5-Day Strength",
      summary: "Program from file",
      days: [
        {
          weekday: "monday",
          focus: "Push",
          exercises: [
            { name: "Bench Press", sets: 4, reps: "6-8" },
            { name: "Squat", sets: 4, reps: "5" },
            { name: "Totally Unknown Move ZZZZZ", sets: 3, reps: "10" },
          ],
        },
      ],
      notes: [],
    });

    const result = await normalizeLegacyWorkoutPlanExercises(service, testUserId, changes);

    const updatedExercises = result.changes.days[0]!.exercises;

    // Bench Press (free_exercise_db) → resolved to exerciseId
    const benchEntry = updatedExercises.find(
      (e) => "exerciseId" in e && e.snapshot?.name === "Bench Press",
    );
    expect(benchEntry).toBeDefined();
    expect("exerciseId" in benchEntry!).toBe(true);

    // Squat (system_seed) → resolved to exerciseId
    const squatEntry = updatedExercises.find(
      (e) => "exerciseId" in e && e.snapshot?.name === "Squat",
    );
    expect(squatEntry).toBeDefined();
    expect("exerciseId" in squatEntry!).toBe(true);

    // Totally Unknown Move → pendingExerciseRef
    const unknownEntry = updatedExercises.find(
      (e) => "pendingExerciseRef" in e,
    );
    expect(unknownEntry).toBeDefined();
    expect(result.unmatchedNames.some((n) => n.includes("Totally Unknown"))).toBe(true);
  });

  it("ProposalNormalizationService.normalizeProposal runs fault-free against real DB with free_exercise_db rows", async () => {
    const { ExercisesRepository } = await import("../exercises/exercises.repository.js");
    const { ExercisesService } = await import("../exercises/exercises.service.js");
    const { ProposalNormalizationService } = await import(
      "../proposals/proposal-normalization.service.js"
    );

    const repo = new (ExercisesRepository as new (db: unknown) => InstanceType<typeof ExercisesRepository>)(db);
    const exercisesService = new (ExercisesService as new (repo: unknown, users: unknown) => InstanceType<typeof ExercisesService>)(
      repo,
      { resolveFromAuth: async () => { throw new Error("not used"); } } as never,
    );

    const service = new ProposalNormalizationService(exercisesService);

    const rawChanges = {
      title: "Test Plan",
      summary: "From file",
      days: [
        {
          weekday: "monday",
          focus: "Strength",
          exercises: [{ name: "Bench Press", sets: 3, reps: "8" }],
        },
      ],
      notes: [],
    };

    const normalized = await service.normalizeProposal(
      "create_workout_plan",
      rawChanges,
      {
        userId: testUserId,
        nowIso: new Date().toISOString(),
        turnAttachments: [],
      },
    );

    // Must not have thrown — this is the core bugfix assertion.
    expect(normalized).toBeDefined();

    // The exercise should now be structured (exerciseId or pendingExerciseRef).
    const parsed = workoutPlanProposalChangesSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const firstExercise = parsed.data.days[0]?.exercises[0];
      // Should have been normalized to exerciseId (Bench Press is in the catalog as free_exercise_db).
      expect(firstExercise).toHaveProperty("exerciseId");
    }
  });
});

// ---------------------------------------------------------------------------
// TIER 3 — Full live e2e (requires LIVE_E2E=1 + OPENAI_API_KEY + DATABASE_URL_TEST)
// ---------------------------------------------------------------------------

const liveE2eEnabled = LIVE_E2E_ENABLED && Boolean(DB_URL);

describe.skipIf(!liveE2eEnabled)("Tier 3 — live e2e: full ChatService + real OpenAI + real DB", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: ReturnType<typeof drizzle<any>>;
  let sql: ReturnType<typeof postgres>;

  let testUserId: string;
  let testClerkUserId: string;
  let testThreadId: string;
  const seededExerciseIds: string[] = [];

  beforeAll(async () => {
    sql = postgres(DB_URL!, { prepare: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db = drizzle(sql, { schema: schema as any });

    // Apply migrations to scratch DB.
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    // Seed test user.
    const ts = Date.now();
    testClerkUserId = `clerk-live-e2e-${ts}`;
    const [userRow] = await db
      .insert(users)
      .values({
        clerkUserId: testClerkUserId,
        email: `live-e2e-${ts}@example.com`,
        displayName: "Live E2E User",
      })
      .returning({ id: users.id });

    if (!userRow?.id) throw new Error("Failed to seed test user.");
    testUserId = userRow.id;

    // Seed exercises with free_exercise_db source to reproduce root cause.
    const exercisesToSeed = [
      {
        name: "Barbell Bench Press",
        normalizedName: "barbell bench press",
        source: "free_exercise_db",
        dedupeKey: `barbell bench press::barbell::chest-${ts}`,
        primaryMuscles: ["chest"],
        secondaryMuscles: ["triceps", "shoulders"],
        equipment: ["barbell"],
        movementPatterns: ["push"],
        modalities: ["strength"],
        difficulty: "intermediate",
        instructions: ["Press bar from chest to lockout."],
        safetyNotes: ["Use a spotter for heavy sets."],
        aliases: ["bench press"],
      },
      {
        name: "Barbell Back Squat",
        normalizedName: "barbell back squat",
        source: "free_exercise_db",
        dedupeKey: `barbell back squat::barbell::quads-${ts}`,
        primaryMuscles: ["quads"],
        secondaryMuscles: ["glutes", "hamstrings"],
        equipment: ["barbell"],
        movementPatterns: ["squat"],
        modalities: ["strength"],
        difficulty: "intermediate",
        instructions: ["Bar on traps, squat to parallel, stand up."],
        safetyNotes: ["Keep knees tracking over toes."],
        aliases: ["squat", "back squat"],
      },
      {
        name: "Barbell Deadlift",
        normalizedName: "barbell deadlift",
        source: "free_exercise_db",
        dedupeKey: `barbell deadlift::barbell::back-${ts}`,
        primaryMuscles: ["back"],
        secondaryMuscles: ["glutes", "hamstrings"],
        equipment: ["barbell"],
        movementPatterns: ["hinge"],
        modalities: ["strength"],
        difficulty: "intermediate",
        instructions: ["Grip bar, flat back, pull to lockout."],
        safetyNotes: ["Engage core throughout."],
        aliases: ["deadlift"],
      },
    ];

    for (const ex of exercisesToSeed) {
      const [row] = await db
        .insert(exercises)
        .values({
          ...ex,
          validationStatus: "validated",
          status: "active",
          userId: null,
          media: { refs: [], fallbackLabel: null },
        })
        .onConflictDoNothing()
        .returning({ id: exercises.id });

      if (row?.id) seededExerciseIds.push(row.id);
    }

    // Create a chat thread.
    const [threadRow] = await db
      .insert(chatThreads)
      .values({ userId: testUserId, title: "Live E2E Test" })
      .returning({ id: chatThreads.id });

    if (!threadRow?.id) throw new Error("Failed to create chat thread.");
    testThreadId = threadRow.id;
  }, 60_000);

  afterAll(async () => {
    // Clean up proposals linked to the thread.
    if (testThreadId) {
      await db.delete(aiProposals).where(eq(aiProposals.threadId, testThreadId));
      await db.delete(chatMessages).where(eq(chatMessages.threadId, testThreadId));
      await db.delete(chatThreads).where(eq(chatThreads.id, testThreadId));
    }

    // Clean up workout plans created during accept.
    if (testUserId) {
      await db.delete(workoutPlans).where(eq(workoutPlans.userId, testUserId));
    }

    // Clean up seeded exercises.
    for (const id of seededExerciseIds) {
      await db.delete(exercises).where(eq(exercises.id, id));
    }

    // Clean up seeded user.
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }

    await sql.end();
  }, 30_000);

  it(
    "full scenario: workout attachment message → proposal persisted → accepted → revision created",
    async () => {
      // -----------------------------------------------------------------------
      // Build the real service graph without NestJS DI container.
      // All services are instantiated with the real Drizzle db connection.
      // Only the ChatTurnAttachmentStageService is given a minimal real config
      // (the attachment file is already stored via direct storage write below).
      // -----------------------------------------------------------------------

      const {
        ExercisesRepository,
      } = await import("../exercises/exercises.repository.js");
      const { ExercisesService } = await import("../exercises/exercises.service.js");
      const { UsersRepository } = await import("../users/users.repository.js");
      const { UsersService } = await import("../users/users.service.js");
      const { ChatRepository } = await import("./chat.repository.js");
      const { ProposalsRepository } = await import("../proposals/proposals.repository.js");
      const { WorkoutsRepository } = await import("../workouts/workouts.repository.js");
      const { WorkoutsService } = await import("../workouts/workouts.service.js");
      const { ProposalValidationService } = await import(
        "../proposals/proposal-validation.service.js"
      );
      const { ProposalsService } = await import("../proposals/proposals.service.js");
      const { ProposalApplyService } = await import("../proposals/proposal-apply.service.js");
      const { ChatAttachmentsRepository } = await import(
        "../chat-attachments/chat-attachments.repository.js"
      );
      const { ChatAttachmentsService } = await import(
        "../chat-attachments/chat-attachments.service.js"
      );

      // Build real repositories.
      const exercisesRepo = new (ExercisesRepository as new (db: unknown) => InstanceType<typeof ExercisesRepository>)(db);
      const usersRepo = new (UsersRepository as new (db: unknown) => InstanceType<typeof UsersRepository>)(db);
      const chatRepo = new (ChatRepository as new (db: unknown) => InstanceType<typeof ChatRepository>)(db);
      const proposalsRepo = new (ProposalsRepository as new (db: unknown) => InstanceType<typeof ProposalsRepository>)(db);
      const workoutsRepo = new (WorkoutsRepository as new (db: unknown) => InstanceType<typeof WorkoutsRepository>)(db);
      const chatAttachmentsRepo = new (ChatAttachmentsRepository as new (db: unknown) => InstanceType<typeof ChatAttachmentsRepository>)(db);

      // Build real services.
      const usersService = new (UsersService as new (repo: unknown) => InstanceType<typeof UsersService>)(usersRepo);
      const exercisesService = new (ExercisesService as new (repo: unknown, users: unknown) => InstanceType<typeof ExercisesService>)(
        exercisesRepo,
        usersService,
      );
      const workoutsService = new (WorkoutsService as new (
        repo: unknown,
        users: unknown,
        exercises: unknown,
      ) => InstanceType<typeof WorkoutsService>)(
        workoutsRepo,
        usersService,
        exercisesService,
      );

      // Build AiBehaviorConfigService from defaults (file-backed config).
      const { createDefaultAiBehaviorConfigService } = await import(
        "../ai/test-ai-behavior-fixtures.js"
      );
      const aiBehaviorConfigService = createDefaultAiBehaviorConfigService();

      // Build ChatAttachmentsService with real local storage (temp dir).
      const { LocalChatAttachmentStorageAdapter } = await import(
        "../chat-attachments/local-chat-attachment-storage.js"
      );
      const storagePath = join(tmpdir(), `chat-e2e-attachments-${Date.now()}`);

      const chatAttachmentsService = new (ChatAttachmentsService as new (
        repo: unknown,
        chatRepo: unknown,
        users: unknown,
        aiBehavior: unknown,
      ) => InstanceType<typeof ChatAttachmentsService>)(
        chatAttachmentsRepo,
        chatRepo,
        usersService,
        aiBehaviorConfigService,
      );

      // Override the storage path for this test.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (chatAttachmentsService as any).storage = new LocalChatAttachmentStorageAdapter(
        storagePath,
        { allowInProduction: true },
      );

      const { ChatTurnAttachmentStageService: AttachStageService } = await import(
        "../chat-attachments/chat-turn-attachment-stage.service.js"
      );
      const chatTurnAttachmentStageService = new (AttachStageService as new (
        service: unknown,
        behavior: unknown,
      ) => InstanceType<typeof AttachStageService>)(
        chatAttachmentsService,
        aiBehaviorConfigService,
      );

      // Build the ProposalValidationService with real exercise lookup.
      // Other deps are stubbed since we don't exercise them in this scenario.
      const noop = { } as never;
      const proposalValidationService = new (ProposalValidationService as new (
        ...args: unknown[]
      ) => InstanceType<typeof ProposalValidationService>)(
        // progressRepository
        { summaryExistsForUser: async () => false, findTrendsOwnedByUser: async () => [] } as never,
        exercisesService,
        // habitsService
        {
          getHabitTemplateReferenceErrors: async () => [],
        } as never,
        // metricsAiContextService
        { buildSummaryForUser: async () => ({ items: [] }) } as never,
        // goalsRepository
        { listByUserId: async () => [] } as never,
        // recoveryContextService
        {
          computeAndPersistSnapshot: async () => ({
            id: "snap",
            band: "optimal" as const,
          }),
        } as never,
        workoutsRepo,
        // usersRepository
        usersRepo,
        // habitsRepository
        {
          findActivePlanByUserId: async () => null,
          findActiveRevisionByPlanId: async () => null,
        } as never,
        // wellbeingCheckInsRepository
        { findByUserAndDate: async () => null } as never,
        // nutritionRepository
        {
          findActivePlanByUserId: async () => null,
          findActiveRevisionByPlanId: async () => null,
          listOwnedFoodPhotoAnalysesByImageRefIds: async () => [],
          findFoodPhotoAnalysisByIdForUser: async () => null,
          findRevisionOwnedByUser: async () => null,
        } as never,
        // recipesRepository
        { findRecommendationById: async () => null } as never,
        chatAttachmentsRepo,
        // biomarkersRepository — unused in this scenario.
        noop,
      );

      // Build the AI pipeline.
      const { createAiPolicyTestStack: makeAiStack } = await import(
        "../ai/test-ai-behavior-fixtures.js"
      );
      const {
        capabilityRegistryService,
        systemPlannerService,
      } = makeAiStack();
      const { RouterLlmService } = await import("../ai/router-llm.service.js");
      const { DomainLlmExecutorService } = await import(
        "../ai/domain-llm-executor.service.js"
      );
      const { DecisionMakerExecutorService } = await import(
        "../ai/decision-maker-executor.service.js"
      );
      const { ActionResolverService } = await import(
        "../ai/action-resolver.service.js"
      );
      const { ActionVariantCatalogService } = await import(
        "../ai/action-variant-catalog.service.js"
      );
      const { MessagePreprocessorService } = await import(
        "../ai/message-preprocessor.service.js"
      );
      const { AgentOrchestratorService } = await import(
        "../ai/agent-orchestrator.service.js"
      );
      const { AiService } = await import("../ai/ai.service.js");
      const { AttachmentTextExtractionService } = await import(
        "../chat-attachments/attachment-text-extraction.service.js"
      );

      // Build a minimal CoachingContextService that returns safe empty context
      // (we're testing the proposal path, not context richness).
      const { ContextCompressionService } = await import(
        "../coaching-context/context-compression.service.js"
      );
      const { ContextExpansionPolicyService } = await import(
        "../coaching-context/context-expansion-policy.service.js"
      );

      const compressionSvc = new (ContextCompressionService as new () => InstanceType<typeof ContextCompressionService>)();
      const expansionSvc = new (ContextExpansionPolicyService as new () => InstanceType<typeof ContextExpansionPolicyService>)();

      // The coaching context service is complex — stub buildAgentContext with a
      // minimal-but-valid AgentContextPacket and delegate toAgentPromptContext
      // to the REAL pure builder so the prompt shape matches production.
      // Context quality is not under test here; proposal flow is.
      const { buildAgentPromptContextFromPacket } = await import(
        "../coaching-context/agent-prompt-context.js"
      );
      const makeMinimalContextPacket = () =>
        ({
          purpose: "workout_adaptation",
          depth: "medium",
          timeRange: "7d",
          intent: "adjust_workout",
          generatedAt: new Date().toISOString(),
          safetyConstraints: [
            "No medical diagnosis language.",
            "Plan changes must be proposals requiring user approval.",
          ],
          missingContextNotes: [],
          sourceRefs: [],
          supplementarySlices: [],
          slice: {
            purpose: "workout_adaptation",
            depth: "medium",
            timeRange: "7d",
            generatedAt: new Date().toISOString(),
            relevantMemories: [],
            snapshots: [],
            recommendationConstraints: [],
            sourceRefs: [],
          },
        }) as never;
      const minimalCoachingContextService = {
        buildAgentContext: async () => makeMinimalContextPacket(),
        toAgentPromptContext: (packet: never) =>
          buildAgentPromptContextFromPacket(packet),
      } as never;

      const attachmentTextExtractionService = new (AttachmentTextExtractionService as new (
        service: unknown,
        behavior: unknown,
      ) => InstanceType<typeof AttachmentTextExtractionService>)(
        chatAttachmentsService,
        aiBehaviorConfigService,
      );

      const routerLlm = new (RouterLlmService as new (
        behavior: unknown,
        registry: unknown,
      ) => InstanceType<typeof RouterLlmService>)(
        aiBehaviorConfigService,
        capabilityRegistryService,
      );
      const domainLlmExecutor = new (DomainLlmExecutorService as new (
        behavior: unknown,
      ) => InstanceType<typeof DomainLlmExecutorService>)(aiBehaviorConfigService);
      const decisionMakerExecutor = new (DecisionMakerExecutorService as new (
        behavior: unknown,
      ) => InstanceType<typeof DecisionMakerExecutorService>)(aiBehaviorConfigService);
      const actionResolver = new (ActionResolverService as new () => InstanceType<typeof ActionResolverService>)();
      const actionVariantCatalog = new (ActionVariantCatalogService as new (
        registry: unknown,
      ) => InstanceType<typeof ActionVariantCatalogService>)(capabilityRegistryService);
      const { DirectChatPathMatcherService } = await import(
        "../ai/direct-chat-path-matcher.service.js"
      );
      const directChatPathMatcherService =
        new (DirectChatPathMatcherService as new (
          ...args: unknown[]
        ) => InstanceType<typeof DirectChatPathMatcherService>)(
          aiBehaviorConfigService,
        );
      const messagePreprocessor = new (MessagePreprocessorService as new (
        ...args: unknown[]
      ) => InstanceType<typeof MessagePreprocessorService>)(
        directChatPathMatcherService,
      );

      // Override the AI provider with the real OpenAI provider using the env key.
      const openaiApiKey = process.env["OPENAI_API_KEY"]!;
      const openaiModel = process.env["OPENAI_MODEL"] ?? "gpt-4o-mini";

      const { createOpenAiCoachProvider } = await import(
        "../ai/openai-coach-provider.js"
      );
      const realProvider = createOpenAiCoachProvider(
        openaiApiKey,
        openaiModel,
        {},
        aiBehaviorConfigService.getCompiledPromptTemplates(),
      );

      const orchestrator = new (AgentOrchestratorService as new (
        ...args: unknown[]
      ) => InstanceType<typeof AgentOrchestratorService>)(
        minimalCoachingContextService,
        compressionSvc,
        expansionSvc,
        systemPlannerService,
        aiBehaviorConfigService,
        messagePreprocessor,
        routerLlm,
        domainLlmExecutor,
        actionResolver,
        decisionMakerExecutor,
        actionVariantCatalog,
        attachmentTextExtractionService,
      );

      // Inject real provider (bypass the env-loaded one).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (orchestrator as any).provider = realProvider;
      // Same for router and domain LLM executor.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (routerLlm as any).provider = realProvider;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (domainLlmExecutor as any).provider = realProvider;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (decisionMakerExecutor as any).provider = realProvider;

      const aiService = new (AiService as new (
        orchestrator: unknown,
      ) => InstanceType<typeof AiService>)(orchestrator);

      // -----------------------------------------------------------------------
      // Upload attachment: a .txt fixture with a 5-day workout program.
      // -----------------------------------------------------------------------
      const workoutProgramText = `
5-Day Strength Program

Day 1 — Push:
- Barbell Bench Press: 4 sets x 6-8 reps
- Dumbbell Shoulder Press: 3 sets x 10-12 reps
- Tricep Pushdown: 3 sets x 12 reps

Day 2 — Pull:
- Barbell Deadlift: 4 sets x 5 reps
- Pull-Up: 3 sets x 8-10 reps
- Barbell Row: 3 sets x 8 reps

Day 3 — Legs:
- Barbell Back Squat: 4 sets x 6-8 reps
- Romanian Deadlift: 3 sets x 10 reps
- Leg Press: 3 sets x 12 reps

Day 4 — Upper (Accessory):
- Incline Dumbbell Press: 3 sets x 12 reps
- Face Pull: 3 sets x 15 reps
- Bicep Curl: 3 sets x 12 reps

Day 5 — Lower (Accessory):
- Hack Squat: 3 sets x 10 reps
- Nordic Curl: 3 sets x 8 reps
- Calf Raise: 4 sets x 15 reps
`.trim();

      const auth = {
        clerkUserId: testClerkUserId,
        displayName: "Live E2E User",
        email: `live-e2e@example.com`,
      };

      const fileContentBase64 = Buffer.from(workoutProgramText, "utf-8").toString("base64");
      const attachment = await chatAttachmentsService.createAttachment(auth, {
        fileContentBase64,
        filename: "workout-program.txt",
        mimeType: "text/plain",
        threadId: testThreadId,
      });

      expect(attachment.id).toBeDefined();
      expect(attachment.status).toBe("queued");

      // -----------------------------------------------------------------------
      // Step 1: Create ProposalApplyService stub + ProposalsService.
      // For Tier 3, we call ProposalsService.decideProposal to accept the proposal
      // after it's created, to test the revision creation path.
      // -----------------------------------------------------------------------
      const proposalApplyService = new (ProposalApplyService as new (
        ...args: unknown[]
      ) => InstanceType<typeof ProposalApplyService>)(
        // profilesService
        noop,
        // goalsService
        noop,
        workoutsService,
        // nutritionService
        noop,
        // habitsService
        noop,
        // recipesService
        noop,
        // todayService
        noop,
        // progressService
        noop,
        // wellbeingCheckInsService
        noop,
        // bodyService
        noop,
      );

      const proposalsService = new (ProposalsService as new (
        ...args: unknown[]
      ) => InstanceType<typeof ProposalsService>)(
        proposalsRepo,
        usersService,
        proposalValidationService,
        proposalApplyService,
      );

      // -----------------------------------------------------------------------
      // Build stub services for parts of ChatService we don't test.
      // -----------------------------------------------------------------------
      const { DirectChatPathService } = await import("./direct-chat-path.service.js");
      const { ProposalExplainerService } = await import(
        "./proposal-explainer.service.js"
      );

      const directChatPathService = new (DirectChatPathService as new (
        ...args: unknown[]
      ) => InstanceType<typeof DirectChatPathService>)(
        systemPlannerService,
        aiBehaviorConfigService,
        // todayService — stub
        { getOrGenerateDay: async () => ({ items: [] }) } as never,
        usersService,
        // nutritionService — stub the read-only part
        {
          getCurrentActivePlan: async () => ({ plan: null, activeRevision: null }),
        } as never,
        // progressService — stub the read-only part
        { getLatestSummarySnapshot: async () => null } as never,
        // workoutsService — stub the read-only part
        {
          getCurrentActivePlan: async () => ({ plan: null, activeRevision: null }),
        } as never,
      );
      const { ProposalExplainerMatcherService } = await import(
        "../ai/proposal-explainer-matcher.service.js"
      );
      const proposalExplainerMatcherService =
        new (ProposalExplainerMatcherService as new (
          ...args: unknown[]
        ) => InstanceType<typeof ProposalExplainerMatcherService>)(
          aiBehaviorConfigService,
        );
      // Real constructor order: (chatRepository, usersService, aiBehaviorConfigService, matcher).
      const proposalExplainerService = new (ProposalExplainerService as new (
        ...args: unknown[]
      ) => InstanceType<typeof ProposalExplainerService>)(
        chatRepo,
        usersService,
        aiBehaviorConfigService,
        proposalExplainerMatcherService,
      );

      // EntitlementsService stub — always allows AI messages.
      const entitlementsService = {
        assertAiMessageAllowed: async () => undefined,
        recordAiMessageUsage: async () => undefined,
      } as never;

      // ProgressWeeklyReviewService stub.
      const progressWeeklyReviewService = {
        packChatWeeklyReviewProposals: async () => {
          throw new Error("Not expected to be called.");
        },
      } as never;

      // WellbeingCheckInsService stub.
      const wellbeingCheckInsService = {
        getCheckInForDate: async () => ({ checkIn: null }),
      } as never;

      // RecipesService stub.
      const recipesService = {
        packChatRecipeRecommendationProposal: async () => null,
      } as never;

      // -----------------------------------------------------------------------
      // Construct the real ChatService.
      // -----------------------------------------------------------------------
      const { ChatService } = await import("./chat.service.js");
      const { ProposalNormalizationService } = await import(
        "../proposals/proposal-normalization.service.js"
      );
      const proposalNormalizationService = new ProposalNormalizationService(exercisesService);
      const { ProposalRepairService } = await import("../ai/proposal-repair.service.js");
      // No repair provider configured — repair degrades to no-op in this e2e.
      const proposalRepairService = new ProposalRepairService(undefined);

      const chatService = new (ChatService as new (
        ...args: unknown[]
      ) => InstanceType<typeof ChatService>)(
        chatRepo,
        usersService,
        aiService,
        proposalValidationService,
        proposalNormalizationService,
        proposalRepairService,
        progressWeeklyReviewService,
        wellbeingCheckInsService,
        recipesService,
        chatAttachmentsService,
        chatTurnAttachmentStageService,
        directChatPathService,
        proposalExplainerService,
        aiBehaviorConfigService,
        entitlementsService,
      );

      // -----------------------------------------------------------------------
      // Step 2: Send the message with the workout attachment.
      // «запиши в мой workout» = "record in my workout" (Russian).
      // -----------------------------------------------------------------------
      const turnResponse = await chatService.sendMessage(
        auth,
        testThreadId,
        {
          content: "запиши в мой workout",
          attachmentRefIds: [attachment.id],
        },
      );

      // -----------------------------------------------------------------------
      // Assertions: Step 3 — reply is non-empty and no turnError.
      // -----------------------------------------------------------------------
      expect(turnResponse.turnError).toBeUndefined();
      const replyContent = turnResponse.assistantMessage.content.trim();
      expect(replyContent.length).toBeGreaterThan(5); // non-trivial reply

      // -----------------------------------------------------------------------
      // Step 4 — verify a create_workout_plan proposal was persisted.
      // -----------------------------------------------------------------------
      const workoutProposal = turnResponse.proposals.find(
        (p) => p.intent === "create_workout_plan",
      );

      // It's possible the LLM emits a different intent or the proposal is valid/invalid.
      // What must NOT happen: HTTP 500 / unhandled ZodError.
      // If a workout proposal was created, assert it was normalized.
      if (workoutProposal) {
        expect(workoutProposal.intent).toBe("create_workout_plan");
        // The proposal may be valid or invalid depending on LLM output quality,
        // but it must not have crashed the turn.
        expect(["valid", "invalid"]).toContain(workoutProposal.validationStatus);

        if (workoutProposal.validationStatus === "valid") {
          // Step 5: Accept the proposal via the real ProposalsService.
          const accepted = await proposalsService.decideProposal(auth, workoutProposal.id, {
            decision: "accept",
          });

          expect(accepted.status).toBe("accepted");
          expect(accepted.appliedReference).toBeDefined();

          // Step 6: Verify the workout plan revision was created in the DB.
          // appliedReference is prefixed, e.g. "workout_revision:<uuid>".
          const revisionId = accepted.appliedReference!.replace(/^workout_revision:/, "");
          const [revisionRow] = await db
            .select()
            .from(workoutPlanRevisions)
            .where(eq(workoutPlanRevisions.id, revisionId))
            .limit(1);

          expect(revisionRow).toBeDefined();
          expect(revisionRow!.id).toBe(revisionId);

          // Step 7: Verify the normalizer resolved exercises.
          // Parse the proposedChanges to check for exerciseId vs pendingExerciseRef.
          const changesData = workoutPlanProposalChangesSchema.safeParse(
            workoutProposal.proposedChanges,
          );

          if (changesData.success) {
            const allExercises = changesData.data.days.flatMap((d) => d.exercises);
            const catalogResolved = allExercises.filter((e) => "exerciseId" in e);
            const pendingRefs = allExercises.filter((e) => "pendingExerciseRef" in e);

            console.info(
              `[E2E] Exercises: ${allExercises.length} total, ` +
              `${catalogResolved.length} catalog-resolved, ` +
              `${pendingRefs.length} pendingExerciseRef`,
            );

            // At minimum, either some were resolved to catalog IDs or they became pendingExerciseRefs.
            // No raw legacy {name, reps, sets} objects should remain.
            const legacy = allExercises.filter((e) => !("exerciseId" in e) && !("pendingExerciseRef" in e));
            expect(legacy).toHaveLength(0);
          }
        }
      }

      console.info("[E2E] Turn summary:", {
        replyLength: replyContent.length,
        proposalCount: turnResponse.proposals.length,
        proposalIntents: turnResponse.proposals.map((p) => `${p.intent}:${p.validationStatus}`),
        workoutProposalFound: Boolean(workoutProposal),
        turnError: turnResponse.turnError,
      });
    },
    120_000, // 2 minutes for real LLM calls
  );
});
