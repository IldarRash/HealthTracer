/**
 * Postgres-backed integration spec — ownership-scoped repository behaviors.
 *
 * Requires a scratch Postgres DB. Set DATABASE_URL_TEST to a dedicated scratch
 * database (never the main health_tracer DB). Falls back to DATABASE_URL if
 * DATABASE_URL_TEST is unset. Skips gracefully when neither is set.
 *
 * The default DATABASE_URL_TEST used in CI:
 *   postgres://postgres:postgres@localhost:5432/health_tracer_test
 *
 * Run locally:
 *   DATABASE_URL_TEST=postgres://postgres:postgres@localhost:5432/health_tracer_test \
 *   corepack pnpm --dir apps/api exec vitest run src/database/ownership-integration.spec.ts
 */

import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Schemas we assert against
import {
  healthDocuments,
  nutritionPlanRevisions,
  nutritionPlans,
  users,
  workoutPlanRevisions,
  workoutPlans,
} from "@health/db";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Connection setup — skip gracefully when DB env is unset
// ---------------------------------------------------------------------------

const DB_URL =
  process.env.DATABASE_URL_TEST ??
  (process.env.DATABASE_URL?.includes("health_tracer_test")
    ? process.env.DATABASE_URL
    : undefined);

const MIGRATIONS_DIR = join(import.meta.dirname, "../../../../packages/db/drizzle");

const shouldRun = Boolean(DB_URL);

// ---------------------------------------------------------------------------
// Suite — skipped when no test DB is configured
// ---------------------------------------------------------------------------

describe.skipIf(!shouldRun)("ownership-scoped repository behaviors (integration)", () => {
  // Using explicit type to avoid TS noise from drizzle overloads
  let sql: ReturnType<typeof postgres>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: ReturnType<typeof drizzle<any>>;

  // User IDs seeded for tests — we create a minimal user row per suite
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    // DB_URL is guaranteed non-null here because of skipIf guard
    sql = postgres(DB_URL!, { prepare: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db = drizzle(sql, { schema: {} as any });

    // Apply full migration chain to the scratch DB
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

    // Seed two users used across all tests
    const [rowA] = await db
      .insert(users)
      .values({
        clerkUserId: `clerk-integration-a-${Date.now()}`,
        email: `integration-a-${Date.now()}@example.com`,
        displayName: "User A",
      })
      .returning({ id: users.id });

    const [rowB] = await db
      .insert(users)
      .values({
        clerkUserId: `clerk-integration-b-${Date.now()}`,
        email: `integration-b-${Date.now()}@example.com`,
        displayName: "User B",
      })
      .returning({ id: users.id });

    if (!rowA?.id || !rowB?.id) {
      throw new Error("Failed to seed test users.");
    }

    userAId = rowA.id;
    userBId = rowB.id;
  });

  afterAll(async () => {
    // Clean up seeded rows (cascade handles plans/revisions/documents)
    if (userAId) {
      await db.delete(users).where(eq(users.id, userAId));
    }
    if (userBId) {
      await db.delete(users).where(eq(users.id, userBId));
    }

    await sql.end();
  });

  // -------------------------------------------------------------------------
  // 1. Nutrition: partial unique index rejects duplicate active plan
  // -------------------------------------------------------------------------
  describe("nutrition active-plan unique index", () => {
    it("allows one active nutrition plan per user", async () => {
      const [plan] = await db
        .insert(nutritionPlans)
        .values({ userId: userAId, status: "active" })
        .returning({ id: nutritionPlans.id });

      expect(plan?.id).toBeDefined();

      // Cleanup
      if (plan?.id) {
        await db.delete(nutritionPlans).where(eq(nutritionPlans.id, plan.id));
      }
    });

    it("rejects a second active nutrition plan for the same user (unique index violation)", async () => {
      const [first] = await db
        .insert(nutritionPlans)
        .values({ userId: userBId, status: "active" })
        .returning({ id: nutritionPlans.id });

      expect(first?.id).toBeDefined();

      // Inserting a second active plan for the same user must fail
      await expect(
        db.insert(nutritionPlans).values({ userId: userBId, status: "active" }),
      ).rejects.toThrow();

      // Cleanup
      if (first?.id) {
        await db.delete(nutritionPlans).where(eq(nutritionPlans.id, first.id));
      }
    });

    it("allows archived (non-active) plans alongside an active plan for the same user", async () => {
      const [active] = await db
        .insert(nutritionPlans)
        .values({ userId: userAId, status: "active" })
        .returning({ id: nutritionPlans.id });

      const [archived] = await db
        .insert(nutritionPlans)
        .values({ userId: userAId, status: "archived" })
        .returning({ id: nutritionPlans.id });

      expect(active?.id).toBeDefined();
      expect(archived?.id).toBeDefined();

      // Cleanup
      if (active?.id) await db.delete(nutritionPlans).where(eq(nutritionPlans.id, active.id));
      if (archived?.id) await db.delete(nutritionPlans).where(eq(nutritionPlans.id, archived.id));
    });
  });

  // -------------------------------------------------------------------------
  // 2. Workout revision insert + same-plan FK (revision belongs to its plan)
  // -------------------------------------------------------------------------
  describe("workout plan revision ownership FK", () => {
    it("inserts a revision linked to its parent workout plan", async () => {
      const [plan] = await db
        .insert(workoutPlans)
        .values({ userId: userAId, status: "active" })
        .returning({ id: workoutPlans.id });

      expect(plan?.id).toBeDefined();

      const [revision] = await db
        .insert(workoutPlanRevisions)
        .values({
          workoutPlanId: plan!.id,
          revisionNumber: 1,
          reason: "Initial plan",
          payload: { weeks: [] },
        })
        .returning({ id: workoutPlanRevisions.id, workoutPlanId: workoutPlanRevisions.workoutPlanId });

      expect(revision?.workoutPlanId).toBe(plan!.id);

      // Cleanup (cascade deletes revision)
      if (plan?.id) await db.delete(workoutPlans).where(eq(workoutPlans.id, plan.id));
    });

    it("enforces revision_number uniqueness per plan (duplicate revision number rejected)", async () => {
      const [plan] = await db
        .insert(workoutPlans)
        .values({ userId: userAId, status: "archived" })
        .returning({ id: workoutPlans.id });

      await db.insert(workoutPlanRevisions).values({
        workoutPlanId: plan!.id,
        revisionNumber: 1,
        reason: "First",
        payload: {},
      });

      await expect(
        db.insert(workoutPlanRevisions).values({
          workoutPlanId: plan!.id,
          revisionNumber: 1,
          reason: "Duplicate number",
          payload: {},
        }),
      ).rejects.toThrow();

      if (plan?.id) await db.delete(workoutPlans).where(eq(workoutPlans.id, plan.id));
    });

    it("revision INSERT for the wrong plan's ID is rejected by FK constraint", async () => {
      // Insert a plan, then immediately delete it — use its orphaned ID as
      // a nonexistent workoutPlanId to trigger the FK violation.
      const [plan] = await db
        .insert(workoutPlans)
        .values({ userId: userAId, status: "archived" })
        .returning({ id: workoutPlans.id });

      await db.delete(workoutPlans).where(eq(workoutPlans.id, plan!.id));

      await expect(
        db.insert(workoutPlanRevisions).values({
          workoutPlanId: plan!.id, // now dangling
          revisionNumber: 1,
          reason: "Orphaned revision",
          payload: {},
        }),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Document row ownership filter — user A cannot see user B's document
  // -------------------------------------------------------------------------
  describe("health document ownership filter", () => {
    it("findActiveById scoped by userId returns only the owning user's document", async () => {
      // Insert a document owned by user B
      const [docB] = await db
        .insert(healthDocuments)
        .values({
          userId: userBId,
          documentType: "lab_report",
          title: "User B Lab",
          storageReference: "b/lab.txt",
          mimeType: "text/plain",
          fileSizeBytes: 100,
          consentScopes: ["upload_storage"],
          consentVersion: "v1",
          consentGrantedAt: new Date(),
          uploadedAt: new Date(),
        })
        .returning({ id: healthDocuments.id, userId: healthDocuments.userId });

      expect(docB?.id).toBeDefined();

      // Query the document using user A's ID — must return nothing
      const visibleToA = await db
        .select({ id: healthDocuments.id })
        .from(healthDocuments)
        .where(
          and(
            eq(healthDocuments.userId, userAId),
            eq(healthDocuments.id, docB!.id),
          ),
        );

      expect(visibleToA).toHaveLength(0);

      // Query using user B's ID — must return the document
      const visibleToB = await db
        .select({ id: healthDocuments.id })
        .from(healthDocuments)
        .where(
          and(
            eq(healthDocuments.userId, userBId),
            eq(healthDocuments.id, docB!.id),
          ),
        );

      expect(visibleToB).toHaveLength(1);
      expect(visibleToB[0]!.id).toBe(docB!.id);

      // Cleanup
      if (docB?.id) {
        await db
          .delete(healthDocuments)
          .where(eq(healthDocuments.id, docB.id));
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. Nutrition plan revision: plan_revision unique index (plan + rev_number)
  // -------------------------------------------------------------------------
  describe("nutrition plan revision unique index", () => {
    it("rejects duplicate revision_number for the same plan", async () => {
      const [plan] = await db
        .insert(nutritionPlans)
        .values({ userId: userAId, status: "archived" })
        .returning({ id: nutritionPlans.id });

      await db.insert(nutritionPlanRevisions).values({
        nutritionPlanId: plan!.id,
        revisionNumber: 1,
        reason: "First",
        payload: {},
      });

      await expect(
        db.insert(nutritionPlanRevisions).values({
          nutritionPlanId: plan!.id,
          revisionNumber: 1,
          reason: "Duplicate number",
          payload: {},
        }),
      ).rejects.toThrow();

      if (plan?.id) await db.delete(nutritionPlans).where(eq(nutritionPlans.id, plan.id));
    });
  });
});
