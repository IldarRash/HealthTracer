import { describe, expect, it } from "vitest";

import { createExerciseInputSchema } from "@health/types";

// Dynamic import of .mjs mapper (NodeNext module resolution)
import {
  buildExerciseDedupeKey,
  inferExerciseModalitiesFromMovementPatterns,
  mapFreeExerciseDbRecord,
  normalizeExerciseName,
} from "./free-exercise-db.mapper.mjs";

// ── Representative raw record (mirrors real free-exercise-db shape) ────────────
const BENCH_PRESS_RECORD = {
  name: "Barbell Bench Press",
  force: "push",
  level: "intermediate",
  mechanic: "compound",
  equipment: "barbell",
  primaryMuscles: ["chest"],
  secondaryMuscles: ["triceps", "shoulders"],
  instructions: [
    "Lie on a flat bench with your feet flat on the floor.",
    "Grip the bar slightly wider than shoulder width.",
    "Lower the bar to your mid-chest under control.",
    "Press the bar back up to full extension.",
  ],
  category: "strength",
  images: ["Barbell_Bench_Press/0.jpg", "Barbell_Bench_Press/1.jpg"],
  id: "Barbell_Bench_Press",
};

const SQUAT_RECORD = {
  name: "Back Squat",
  force: "push",
  level: "intermediate",
  mechanic: "compound",
  equipment: "barbell",
  primaryMuscles: ["quadriceps"],
  secondaryMuscles: ["glutes", "hamstrings", "lower back"],
  instructions: [
    "Stand with feet shoulder-width apart.",
    "Lower hips until thighs are parallel to the floor.",
    "Drive through your feet to return to the start.",
  ],
  category: "strength",
  images: [],
  id: "Back_Squat",
};

const STRETCH_RECORD = {
  name: "Standing Hamstring Stretch",
  force: "static",
  level: "beginner",
  mechanic: null,
  equipment: "body only",
  primaryMuscles: ["hamstrings"],
  secondaryMuscles: ["calves"],
  instructions: ["Stand tall, reach toward your toes, hold for 30 seconds."],
  category: "stretching",
  images: ["Standing_Hamstring_Stretch/0.jpg"],
  id: "Standing_Hamstring_Stretch",
};

const CARDIO_RECORD = {
  name: "Jump Rope",
  force: "push",
  level: "beginner",
  mechanic: null,
  equipment: "other",
  primaryMuscles: ["calves"],
  secondaryMuscles: ["shoulders"],
  instructions: ["Hold handles, swing rope overhead, jump."],
  category: "cardio",
  images: [],
  id: "Jump_Rope",
};

const PLYOMETRIC_RECORD = {
  name: "Box Jump",
  force: "push",
  level: "intermediate",
  mechanic: "compound",
  equipment: "body only",
  primaryMuscles: ["quadriceps"],
  secondaryMuscles: ["glutes", "calves"],
  instructions: ["Stand in front of box, jump onto it, step down."],
  category: "plyometrics",
  images: [],
  id: "Box_Jump",
};

const IMAGE_BASE_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("mapFreeExerciseDbRecord", () => {
  it("maps a representative strength record to a schema-valid object", () => {
    const result = mapFreeExerciseDbRecord(BENCH_PRESS_RECORD);
    expect(result).not.toBeNull();

    // Should pass createExerciseInputSchema parse (with source override)
    expect(() =>
      createExerciseInputSchema.parse({ ...result!, source: "ai_generated" }),
    ).not.toThrow();
  });

  it("maps another strength record correctly", () => {
    const result = mapFreeExerciseDbRecord(SQUAT_RECORD);
    expect(result).not.toBeNull();
    expect(result!.primaryMuscles).toContain("quads");
    expect(result!.secondaryMuscles).toContain("glutes");
    expect(result!.secondaryMuscles).toContain("hamstrings");
    // "lower back" maps to "back"
    expect(result!.secondaryMuscles).toContain("back");
    // No duplicates in secondaryMuscles vs primaryMuscles
    result!.secondaryMuscles.forEach((m) => {
      expect(result!.primaryMuscles).not.toContain(m);
    });
  });

  describe("muscle vocabulary mapping", () => {
    it("maps 'abdominals' to 'core'", () => {
      const r = mapFreeExerciseDbRecord({
        ...BENCH_PRESS_RECORD,
        primaryMuscles: ["abdominals"],
        secondaryMuscles: [],
      });
      expect(r!.primaryMuscles).toEqual(["core"]);
    });

    it("maps 'quadriceps' to 'quads'", () => {
      const r = mapFreeExerciseDbRecord({
        ...BENCH_PRESS_RECORD,
        primaryMuscles: ["quadriceps"],
        secondaryMuscles: [],
      });
      expect(r!.primaryMuscles).toEqual(["quads"]);
    });

    it("maps 'lower back' and 'middle back' to 'back'", () => {
      const r = mapFreeExerciseDbRecord({
        ...BENCH_PRESS_RECORD,
        primaryMuscles: ["lower back"],
        secondaryMuscles: ["middle back"],
      });
      expect(r!.primaryMuscles).toEqual(["back"]);
      // Deduped: secondary 'middle back' → 'back' but primary already has 'back'
      expect(r!.secondaryMuscles).not.toContain("back");
    });

    it("drops unmappable muscles (neck, abductors, adductors)", () => {
      const r = mapFreeExerciseDbRecord({
        ...BENCH_PRESS_RECORD,
        primaryMuscles: ["chest"],
        secondaryMuscles: ["neck", "adductors", "abductors"],
      });
      expect(r!.secondaryMuscles).toHaveLength(0);
    });

    it("deduplicates muscles across primary list", () => {
      // "lower back" and "middle back" both map to "back"
      const r = mapFreeExerciseDbRecord({
        ...BENCH_PRESS_RECORD,
        primaryMuscles: ["lower back", "middle back", "lats"],
        secondaryMuscles: [],
      });
      expect(r!.primaryMuscles.filter((m) => m === "back")).toHaveLength(1);
    });
  });

  describe("equipment vocabulary mapping", () => {
    it("maps 'body only' to ['bodyweight']", () => {
      const r = mapFreeExerciseDbRecord({
        ...BENCH_PRESS_RECORD,
        equipment: "body only",
      });
      expect(r!.equipment).toEqual(["bodyweight"]);
    });

    it("maps null equipment to ['bodyweight']", () => {
      const r = mapFreeExerciseDbRecord({
        ...BENCH_PRESS_RECORD,
        equipment: null,
      });
      expect(r!.equipment).toEqual(["bodyweight"]);
    });

    it("maps 'bands' to ['resistance_band']", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, equipment: "bands" });
      expect(r!.equipment).toEqual(["resistance_band"]);
    });

    it("maps 'e-z curl bar' to ['ez_bar']", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, equipment: "e-z curl bar" });
      expect(r!.equipment).toEqual(["ez_bar"]);
    });

    it("maps 'medicine ball' to ['medicine_ball']", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, equipment: "medicine ball" });
      expect(r!.equipment).toEqual(["medicine_ball"]);
    });

    it("maps 'kettlebells' to ['kettlebell']", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, equipment: "kettlebells" });
      expect(r!.equipment).toEqual(["kettlebell"]);
    });

    it("maps 'foam roll' to ['foam_roller']", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, equipment: "foam roll" });
      expect(r!.equipment).toEqual(["foam_roller"]);
    });

    it("maps 'other' to ['none']", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, equipment: "other" });
      expect(r!.equipment).toEqual(["none"]);
    });

    it("maps unrecognised equipment to ['none']", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, equipment: "unknown_widget" });
      expect(r!.equipment).toEqual(["none"]);
    });
  });

  describe("level mapping", () => {
    it("maps 'beginner' to 'beginner'", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, level: "beginner" });
      expect(r!.difficulty).toBe("beginner");
    });

    it("maps 'intermediate' to 'intermediate'", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, level: "intermediate" });
      expect(r!.difficulty).toBe("intermediate");
    });

    it("maps 'expert' to 'advanced'", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, level: "expert" });
      expect(r!.difficulty).toBe("advanced");
    });

    it("falls back to 'intermediate' for unknown level", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, level: "elite" });
      expect(r!.difficulty).toBe("intermediate");
    });
  });

  describe("movement pattern derivation", () => {
    it("derives 'push' pattern from force:push", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, force: "push", mechanic: "compound" });
      expect(r!.movementPatterns).toContain("push");
    });

    it("derives 'pull' pattern from force:pull", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, force: "pull", mechanic: "compound" });
      expect(r!.movementPatterns).toContain("pull");
    });

    it("derives 'isolation' from mechanic:isolation", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, force: null, mechanic: "isolation" });
      expect(r!.movementPatterns).toContain("isolation");
    });

    it("derives 'cardio' for cardio category", () => {
      const r = mapFreeExerciseDbRecord(CARDIO_RECORD);
      expect(r!.movementPatterns).toContain("cardio");
    });

    it("derives 'flexibility' for stretching category", () => {
      const r = mapFreeExerciseDbRecord(STRETCH_RECORD);
      expect(r!.movementPatterns).toContain("flexibility");
    });

    it("derives 'plyometric' for plyometrics category", () => {
      const r = mapFreeExerciseDbRecord(PLYOMETRIC_RECORD);
      expect(r!.movementPatterns).toContain("plyometric");
    });

    it("always produces at least one movement pattern", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, force: null, mechanic: null, category: "strength" });
      expect(r!.movementPatterns.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("modalities from movement patterns", () => {
    it("returns ['conditioning'] for cardio pattern", () => {
      expect(inferExerciseModalitiesFromMovementPatterns(["cardio"])).toEqual(["conditioning"]);
    });

    it("returns ['plyometrics', 'athletic_performance'] for plyometric", () => {
      expect(inferExerciseModalitiesFromMovementPatterns(["plyometric"])).toEqual([
        "plyometrics",
        "athletic_performance",
      ]);
    });

    it("returns ['mobility'] for flexibility pattern", () => {
      expect(inferExerciseModalitiesFromMovementPatterns(["flexibility"])).toEqual(["mobility"]);
    });

    it("returns ['strength'] as default", () => {
      expect(inferExerciseModalitiesFromMovementPatterns(["push", "isolation"])).toEqual(["strength"]);
    });
  });

  describe("image ref URL building", () => {
    it("builds correct absolute URLs from relative image paths", () => {
      const r = mapFreeExerciseDbRecord(BENCH_PRESS_RECORD);
      expect(r!.media.refs).toHaveLength(2);
      expect(r!.media.refs[0]!.kind).toBe("image");
      expect(r!.media.refs[0]!.url).toBe(`${IMAGE_BASE_URL}Barbell_Bench_Press/0.jpg`);
      expect(r!.media.refs[1]!.url).toBe(`${IMAGE_BASE_URL}Barbell_Bench_Press/1.jpg`);
    });

    it("caps refs at 3 images", () => {
      const r = mapFreeExerciseDbRecord({
        ...BENCH_PRESS_RECORD,
        images: ["a/0.jpg", "a/1.jpg", "a/2.jpg", "a/3.jpg"],
      });
      expect(r!.media.refs).toHaveLength(3);
    });

    it("produces empty refs array when no images", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, images: [] });
      expect(r!.media.refs).toHaveLength(0);
    });
  });

  describe("unmappable records", () => {
    it("returns null for a record with no name", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, name: "" });
      expect(r).toBeNull();
    });

    it("returns null for a record with no instructions", () => {
      const r = mapFreeExerciseDbRecord({ ...BENCH_PRESS_RECORD, instructions: [] });
      expect(r).toBeNull();
    });

    it("returns null for a record where all primaryMuscles are unmappable and no category fallback", () => {
      // "neck" is not mappable; if we also have no valid category fallback muscle we drop the record
      const r = mapFreeExerciseDbRecord({
        ...BENCH_PRESS_RECORD,
        primaryMuscles: ["neck"],
        category: "unknown_category",
      });
      expect(r).toBeNull();
    });

    it("falls back to category muscle for unmappable primaryMuscles in known category", () => {
      // "neck" is not mappable, but category "cardio" → fallback "quads"
      const r = mapFreeExerciseDbRecord({
        ...BENCH_PRESS_RECORD,
        primaryMuscles: ["neck"],
        category: "cardio",
      });
      expect(r).not.toBeNull();
      expect(r!.primaryMuscles).toEqual(["quads"]);
    });
  });

  describe("fixed metadata fields", () => {
    it("sets source to free_exercise_db", () => {
      const r = mapFreeExerciseDbRecord(BENCH_PRESS_RECORD);
      expect(r!.source).toBe("free_exercise_db");
    });

    it("sets validationStatus to validated", () => {
      const r = mapFreeExerciseDbRecord(BENCH_PRESS_RECORD);
      expect(r!.validationStatus).toBe("validated");
    });

    it("sets status to active", () => {
      const r = mapFreeExerciseDbRecord(BENCH_PRESS_RECORD);
      expect(r!.status).toBe("active");
    });

    it("sets userId to null", () => {
      const r = mapFreeExerciseDbRecord(BENCH_PRESS_RECORD);
      expect(r!.userId).toBeNull();
    });

    it("sets aliases to empty array", () => {
      const r = mapFreeExerciseDbRecord(BENCH_PRESS_RECORD);
      expect(r!.aliases).toEqual([]);
    });

    it("includes a non-empty safetyNotes array", () => {
      const r = mapFreeExerciseDbRecord(BENCH_PRESS_RECORD);
      expect(r!.safetyNotes.length).toBeGreaterThan(0);
    });
  });

  describe("dedupeKey generation", () => {
    it("generates a stable dedupeKey for a representative record", () => {
      const r = mapFreeExerciseDbRecord(BENCH_PRESS_RECORD);
      const expected = buildExerciseDedupeKey({
        normalizedName: normalizeExerciseName("Barbell Bench Press"),
        equipment: ["barbell"],
        primaryMuscles: ["chest"],
      });
      expect(r!.dedupeKey).toBe(expected);
    });

    it("dedupeKey includes sorted equipment", () => {
      const key = buildExerciseDedupeKey({
        normalizedName: "test",
        equipment: ["bench", "barbell"],
        primaryMuscles: ["chest"],
      });
      expect(key).toBe("test::barbell|bench::chest");
    });

    it("dedupeKey includes sorted primaryMuscles", () => {
      const key = buildExerciseDedupeKey({
        normalizedName: "test",
        equipment: ["barbell"],
        primaryMuscles: ["glutes", "back"],
      });
      expect(key).toBe("test::barbell::back|glutes");
    });
  });

  describe("full schema validation", () => {
    it("all representative records pass createExerciseInputSchema", () => {
      const records = [
        BENCH_PRESS_RECORD,
        SQUAT_RECORD,
        STRETCH_RECORD,
        CARDIO_RECORD,
        PLYOMETRIC_RECORD,
      ];
      for (const rec of records) {
        const mapped = mapFreeExerciseDbRecord(rec);
        if (!mapped) continue; // unmappable records are tested separately
        expect(() =>
          createExerciseInputSchema.parse({ ...mapped, source: "ai_generated" }),
        ).not.toThrow();
      }
    });
  });
});
