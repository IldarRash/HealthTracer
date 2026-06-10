/**
 * Mapper for free-exercise-db records (yuhonas/free-exercise-db, Unlicense/Public Domain).
 *
 * Converts a raw record from dist/exercises.json into a shape compatible with
 * createExerciseInputSchema from @health/types.
 *
 * Returns null for records that cannot produce a valid seed row (e.g., unmappable
 * primary muscles after fallback attempts).
 */

/** @typedef {import('./types.d.mjs').FreeExerciseDbRecord} FreeExerciseDbRecord */
/** @typedef {import('./types.d.mjs').MappedExercise} MappedExercise */

// ── Image base URL ─────────────────────────────────────────────────────────────
const IMAGE_BASE_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

// ── Muscle vocabulary map ──────────────────────────────────────────────────────
// free-exercise-db muscle name → our exerciseMuscleSchema value (or null = drop)
/** @type {Record<string, string | null>} */
const MUSCLE_MAP = {
  abdominals: "core",
  "lower back": "back",
  "middle back": "back",
  lats: "lats",
  traps: "traps",
  shoulders: "shoulders",
  chest: "chest",
  biceps: "biceps",
  triceps: "triceps",
  forearms: "forearms",
  hamstrings: "hamstrings",
  quadriceps: "quads",
  glutes: "glutes",
  calves: "calves",
  // No clean mapping — drop
  neck: null,
  abductors: null,
  adductors: null,
};

// ── Equipment vocabulary map ───────────────────────────────────────────────────
// free-exercise-db equipment string → our exerciseEquipmentSchema value(s)
/** @type {Record<string, string[]>} */
const EQUIPMENT_MAP = {
  "body only": ["bodyweight"],
  barbell: ["barbell"],
  dumbbell: ["dumbbell"],
  cable: ["cable"],
  machine: ["machine"],
  kettlebells: ["kettlebell"],
  bands: ["resistance_band"],
  "medicine ball": ["medicine_ball"],
  "exercise ball": ["medicine_ball"],
  "e-z curl bar": ["ez_bar"],
  "foam roll": ["foam_roller"],
  // "other" and anything unrecognised → none
  other: ["none"],
};

// ── Level map ─────────────────────────────────────────────────────────────────
/** @type {Record<string, string>} */
const LEVEL_MAP = {
  beginner: "beginner",
  intermediate: "intermediate",
  expert: "advanced",
};

// ── Category → movement pattern fallback ──────────────────────────────────────
/** @type {Record<string, string[]>} */
const CATEGORY_PATTERN_MAP = {
  strength: ["isolation"],
  stretching: ["flexibility"],
  plyometrics: ["plyometric"],
  strongman: ["carry"],
  powerlifting: ["hinge"],
  cardio: ["cardio"],
  "olympic weightlifting": ["hinge"],
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Normalizes an exercise name to a consistent lowercase slug (mirrors the TS helper).
 * @param {string} name
 * @returns {string}
 */
export function normalizeExerciseName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Builds the dedupeKey used for ON CONFLICT (mirrors the TS helper exactly).
 * @param {{ normalizedName: string; equipment: string[]; primaryMuscles: string[] }} input
 * @returns {string}
 */
export function buildExerciseDedupeKey({ normalizedName, equipment, primaryMuscles }) {
  const equipmentKey = [...equipment].sort().join("|");
  const musclesKey = [...primaryMuscles].sort().join("|");
  return `${normalizedName}::${equipmentKey}::${musclesKey}`;
}

/**
 * Infers exercise modalities from movement patterns (mirrors the TS helper).
 * @param {string[]} movementPatterns
 * @returns {string[]}
 */
export function inferExerciseModalitiesFromMovementPatterns(movementPatterns) {
  if (movementPatterns.includes("cardio")) return ["conditioning"];
  if (movementPatterns.includes("plyometric")) return ["plyometrics", "athletic_performance"];
  if (
    movementPatterns.includes("mobility") ||
    movementPatterns.includes("flexibility") ||
    movementPatterns.includes("balance")
  ) {
    return ["mobility"];
  }
  return ["strength"];
}

/**
 * Maps a raw muscle string to our schema value, or null if it should be dropped.
 * @param {string} raw
 * @returns {string | null}
 */
function mapMuscle(raw) {
  const key = raw.trim().toLowerCase();
  if (key in MUSCLE_MAP) return MUSCLE_MAP[key] ?? null;
  return null;
}

/**
 * Maps and deduplicates a list of raw muscle strings.
 * @param {string[]} raw
 * @returns {string[]}
 */
function mapMuscles(raw) {
  const seen = new Set();
  const out = [];
  for (const m of raw) {
    const mapped = mapMuscle(m);
    if (mapped && !seen.has(mapped)) {
      seen.add(mapped);
      out.push(mapped);
    }
  }
  return out;
}

/**
 * Maps a free-exercise-db equipment string to our equipment array.
 * Null / missing / unrecognised → ["none"].
 * @param {string | null | undefined} raw
 * @returns {string[]}
 */
function mapEquipment(raw) {
  if (!raw) return ["bodyweight"];
  const key = raw.trim().toLowerCase();
  if (key === "body only") return ["bodyweight"];
  return EQUIPMENT_MAP[key] ?? ["none"];
}

/**
 * Derives movement patterns from force, mechanic, and category fields.
 * Guarantees at least one pattern.
 * @param {{ force?: string | null; mechanic?: string | null; category?: string }} params
 * @returns {string[]}
 */
function deriveMovementPatterns({ force, mechanic, category }) {
  const patterns = new Set();

  // Category-driven overrides (highest priority for special categories)
  if (category === "stretching") {
    patterns.add("flexibility");
  } else if (category === "cardio") {
    patterns.add("cardio");
  } else if (category === "plyometrics") {
    patterns.add("plyometric");
  }

  // Force signal
  if (force === "push") patterns.add("push");
  else if (force === "pull") patterns.add("pull");
  // "static" → could be flexibility/balance but we let category handle it

  // Mechanic signal
  if (mechanic === "isolation") patterns.add("isolation");

  // Fallback from category if still empty
  if (patterns.size === 0) {
    const fallback = CATEGORY_PATTERN_MAP[category ?? "strength"] ?? ["isolation"];
    fallback.forEach((p) => patterns.add(p));
  }

  // Hard fallback: should never stay empty
  if (patterns.size === 0) patterns.add("isolation");

  // Cap to max 4 (schema limit)
  return [...patterns].slice(0, 4);
}

/**
 * Filters, trims, and caps instruction strings.
 * @param {string[] | undefined} raw
 * @returns {string[]}
 */
function mapInstructions(raw) {
  if (!raw || raw.length === 0) return [];
  return raw
    .map((s) => s.trim().slice(0, 1000))
    .filter((s) => s.length > 0)
    .slice(0, 20);
}

/**
 * Builds image media refs from the raw images array.
 * Caps to 3 and prepends the base URL.
 * @param {string[]} images
 * @returns {{ kind: string; url: string }[]}
 */
function mapImageRefs(images) {
  return images
    .slice(0, 3)
    .map((path) => ({ kind: "image", url: `${IMAGE_BASE_URL}${path}` }));
}

// ── Primary export ─────────────────────────────────────────────────────────────

/**
 * Maps a free-exercise-db record to a seed-compatible exercise object.
 *
 * Returns null if:
 *   - The name is missing or empty.
 *   - Zero instructions remain after filtering.
 *   - Primary muscles cannot be resolved to at least one schema-valid value
 *     (even after category-based fallback).
 *
 * @param {Record<string, unknown>} record
 * @returns {MappedExercise | null}
 */
export function mapFreeExerciseDbRecord(record) {
  // ── Name ──────────────────────────────────────────────────────────────────
  const rawName = typeof record["name"] === "string" ? record["name"].trim() : "";
  if (!rawName) return null;
  const name = rawName.slice(0, 160);

  // ── Instructions ──────────────────────────────────────────────────────────
  const instructions = mapInstructions(
    Array.isArray(record["instructions"]) ? /** @type {string[]} */ (record["instructions"]) : [],
  );
  if (instructions.length === 0) return null;

  // ── Muscles ───────────────────────────────────────────────────────────────
  const rawPrimary = Array.isArray(record["primaryMuscles"])
    ? /** @type {string[]} */ (record["primaryMuscles"])
    : [];
  const rawSecondary = Array.isArray(record["secondaryMuscles"])
    ? /** @type {string[]} */ (record["secondaryMuscles"])
    : [];

  let primaryMuscles = mapMuscles(rawPrimary);
  const secondaryMuscles = mapMuscles(rawSecondary).filter(
    (m) => !primaryMuscles.includes(m),
  );

  // Category-based fallback for unmappable primaries
  if (primaryMuscles.length === 0) {
    const category = typeof record["category"] === "string" ? record["category"] : "";
    const fallback = CATEGORY_MUSCLE_FALLBACK[category] ?? null;
    if (fallback) {
      primaryMuscles = [fallback];
    } else {
      return null;
    }
  }

  // Cap to schema limits
  primaryMuscles = primaryMuscles.slice(0, 6);

  // ── Equipment ─────────────────────────────────────────────────────────────
  const equipment = mapEquipment(
    typeof record["equipment"] === "string" ? record["equipment"] : null,
  ).slice(0, 6);

  // ── Difficulty ────────────────────────────────────────────────────────────
  const rawLevel = typeof record["level"] === "string" ? record["level"].toLowerCase() : "";
  const difficulty = LEVEL_MAP[rawLevel] ?? "intermediate";

  // ── Movement patterns ─────────────────────────────────────────────────────
  const movementPatterns = deriveMovementPatterns({
    force: typeof record["force"] === "string" ? record["force"] : null,
    mechanic: typeof record["mechanic"] === "string" ? record["mechanic"] : null,
    category: typeof record["category"] === "string" ? record["category"] : undefined,
  }).slice(0, 4);

  // ── Modalities ────────────────────────────────────────────────────────────
  const modalities = inferExerciseModalitiesFromMovementPatterns(movementPatterns).slice(0, 3);

  // ── Images ────────────────────────────────────────────────────────────────
  const rawImages = Array.isArray(record["images"]) ? /** @type {string[]} */ (record["images"]) : [];
  const refs = mapImageRefs(rawImages);
  const media = { refs, fallbackLabel: null };

  // ── DedupeKey ─────────────────────────────────────────────────────────────
  const normalizedName = normalizeExerciseName(name);
  const dedupeKey = buildExerciseDedupeKey({ normalizedName, equipment, primaryMuscles });

  // ── Assemble result ───────────────────────────────────────────────────────
  return {
    name,
    aliases: [],
    primaryMuscles,
    secondaryMuscles: secondaryMuscles.slice(0, 6),
    equipment,
    movementPatterns,
    modalities,
    difficulty,
    instructions,
    safetyNotes: ["Always warm up before exercising and stop if you feel pain."],
    media,
    source: "free_exercise_db",
    validationStatus: "validated",
    status: "active",
    userId: null,
    normalizedName,
    dedupeKey,
  };
}

// ── Category-to-muscle fallback for unmappable primaries ──────────────────────
/** @type {Record<string, string>} */
const CATEGORY_MUSCLE_FALLBACK = {
  strength: "core",
  stretching: "core",
  plyometrics: "quads",
  strongman: "back",
  powerlifting: "back",
  cardio: "quads",
  "olympic weightlifting": "back",
};
