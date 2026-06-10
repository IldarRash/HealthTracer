/**
 * Generates packages/db/drizzle/seeds/exercises.sql from:
 *   1. free-exercise-db (packages/db/scripts/data/free-exercise-db.json) — ~873 records
 *   2. Curated system_seed rows that are folded in with the same column layout
 *
 * Deduplication: within this file, the first occurrence of each dedupeKey wins.
 * The SQL uses ON CONFLICT (dedupe_key) WHERE user_id IS NULL DO NOTHING so
 * re-running the seed against an existing DB is always safe.
 *
 * Validation: every mapped record is checked against createExerciseInputSchema
 * (imported dynamically from @health/types). Any violation causes a loud error
 * so we never emit invalid SQL.
 *
 * Run via: node packages/db/scripts/generate-exercises-seed.mjs
 * Or via:  pnpm --filter @health/db exec node scripts/generate-exercises-seed.mjs
 */

/* global console, process */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildExerciseDedupeKey,
  inferExerciseModalitiesFromMovementPatterns,
  mapFreeExerciseDbRecord,
  normalizeExerciseName,
} from "./free-exercise-db.mapper.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load @health/types (Zod contracts) ────────────────────────────────────────
// Dynamically import from the workspace TS source (works when vitest/ts-node transforms it).
// Falls back to the manual structural validator below if plain node can't load the TS source.
let createExerciseInputSchemaRaw;
try {
  const typesPath = resolve(
    __dirname,
    "../../../packages/types/src/exercises.js",
  );
  const mod = await import(typesPath).catch(() => null);
  createExerciseInputSchemaRaw = mod?.createExerciseInputSchema;
} catch {
  // second attempt: try .ts via ts-node shim (not available in plain node)
}

// Fallback: if we cannot load the TS source, build a minimal structural
// validator from the enums we know.  This keeps the generator runnable
// even without ts-node while still catching basic shape errors.
const VALID_MUSCLES = new Set([
  "chest","back","shoulders","biceps","triceps","forearms","quads",
  "hamstrings","glutes","calves","core","hip_flexors","lats","traps",
]);
const VALID_EQUIPMENT = new Set([
  "barbell","dumbbell","kettlebell","bodyweight","cable","machine",
  "resistance_band","bench","pull_up_bar","medicine_ball","ez_bar",
  "smith_machine","yoga_mat","box","foam_roller","jump_rope","none",
]);
const VALID_PATTERNS = new Set([
  "push","pull","squat","hinge","lunge","carry","rotation","isolation",
  "cardio","plyometric","mobility","flexibility","balance",
]);
const VALID_MODALITIES = new Set([
  "strength","athletic_performance","plyometrics","yoga","mobility",
  "conditioning","wellness",
]);
const VALID_DIFFICULTY = new Set(["beginner","intermediate","advanced"]);

/**
 * Validates a mapped exercise object and throws with a descriptive message if
 * anything is wrong.  Uses the Zod schema when available, structural check otherwise.
 * @param {Record<string,unknown>} obj
 * @param {string} name  Original name for error context.
 */
function validateMapped(obj, name) {
  if (createExerciseInputSchemaRaw) {
    // Zod parse (will throw ZodError with details if invalid)
    createExerciseInputSchemaRaw.parse({
      ...obj,
      // createExerciseInputSchema only allows ai_generated|user_created for source;
      // we inject free_exercise_db at the DB level so skip source validation here
      source: "ai_generated",
    });
    return;
  }

  // Manual structural check
  const errors = [];
  if (!obj["name"] || typeof obj["name"] !== "string") errors.push("name missing");
  if (!Array.isArray(obj["primaryMuscles"]) || obj["primaryMuscles"].length === 0)
    errors.push("primaryMuscles empty");
  (/** @type {string[]} */ (obj["primaryMuscles"] ?? [])).forEach((m) => {
    if (!VALID_MUSCLES.has(m)) errors.push(`invalid muscle: ${m}`);
  });
  (/** @type {string[]} */ (obj["secondaryMuscles"] ?? [])).forEach((m) => {
    if (!VALID_MUSCLES.has(m)) errors.push(`invalid secondary muscle: ${m}`);
  });
  if (!Array.isArray(obj["equipment"]) || obj["equipment"].length === 0)
    errors.push("equipment empty");
  (/** @type {string[]} */ (obj["equipment"] ?? [])).forEach((e) => {
    if (!VALID_EQUIPMENT.has(e)) errors.push(`invalid equipment: ${e}`);
  });
  if (!Array.isArray(obj["movementPatterns"]) || obj["movementPatterns"].length === 0)
    errors.push("movementPatterns empty");
  (/** @type {string[]} */ (obj["movementPatterns"] ?? [])).forEach((p) => {
    if (!VALID_PATTERNS.has(p)) errors.push(`invalid pattern: ${p}`);
  });
  if (!Array.isArray(obj["modalities"]) || obj["modalities"].length === 0)
    errors.push("modalities empty");
  (/** @type {string[]} */ (obj["modalities"] ?? [])).forEach((m) => {
    if (!VALID_MODALITIES.has(m)) errors.push(`invalid modality: ${m}`);
  });
  if (!VALID_DIFFICULTY.has(/** @type {string} */ (obj["difficulty"])))
    errors.push(`invalid difficulty: ${obj["difficulty"]}`);
  if (!Array.isArray(obj["instructions"]) || obj["instructions"].length === 0)
    errors.push("instructions empty");
  if (!Array.isArray(obj["safetyNotes"]) || obj["safetyNotes"].length === 0)
    errors.push("safetyNotes empty");

  if (errors.length > 0) {
    throw new Error(`Validation failed for "${name}": ${errors.join("; ")}`);
  }
}

// ── SQL helpers ───────────────────────────────────────────────────────────────

/**
 * Escapes a string for use as a SQL single-quoted literal.
 * @param {string} value
 * @returns {string}
 */
function sqlString(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Serializes an array to a JSON SQL string literal.
 * @param {unknown[]} arr
 * @returns {string}
 */
function sqlJson(arr) {
  return sqlString(JSON.stringify(arr));
}

/**
 * Generates a deterministic UUID-like id for a free-exercise-db row.
 * Pattern: f0000000-0000-4000-8000-NNNNNNNNNNNN where N is a 12-digit zero-padded
 * sequential index. These UUIDs are stable across regenerations as long as
 * the source array order doesn't change.
 * @param {number} index
 * @returns {string}
 */
function freeExerciseDbId(index) {
  const n = String(index).padStart(12, "0");
  return `f0000000-0000-4000-8000-${n}`;
}

// ── Curated system_seed rows (previously hardcoded, kept verbatim) ─────────────
// These are folded first so their dedupeKeys win over free-exercise-db duplicates.
/** @type {Array<{
 *   id: string;
 *   name: string;
 *   aliases: string[];
 *   primary: string[];
 *   secondary: string[];
 *   equipment: string[];
 *   patterns: string[];
 *   difficulty: string;
 *   instructions: string[];
 *   safety: string[];
 * }>} */
const CURATED = [
  {
    id: "b1000001-0000-4000-8000-000000000001",
    name: "Barbell Bench Press",
    aliases: ["bench press"],
    primary: ["chest"],
    secondary: ["triceps", "shoulders"],
    equipment: ["barbell", "bench"],
    patterns: ["push"],
    difficulty: "intermediate",
    instructions: [
      "Lie on a flat bench with feet planted.",
      "Grip the bar slightly wider than shoulder width.",
      "Lower the bar to mid-chest with control.",
      "Press up without bouncing the bar.",
    ],
    safety: ["Use a spotter or safety arms when lifting heavy.", "Keep wrists stacked over elbows."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000002",
    name: "Dumbbell Bench Press",
    aliases: [],
    primary: ["chest"],
    secondary: ["triceps", "shoulders"],
    equipment: ["dumbbell", "bench"],
    patterns: ["push"],
    difficulty: "beginner",
    instructions: [
      "Sit on a bench with dumbbells on thighs.",
      "Lie back and position dumbbells over chest.",
      "Lower with control until upper arms are parallel.",
      "Press up while keeping shoulder blades retracted.",
    ],
    safety: ["Choose a weight you can control on the descent."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000003",
    name: "Push-Up",
    aliases: ["push up"],
    primary: ["chest", "triceps"],
    secondary: ["shoulders", "core"],
    equipment: ["bodyweight"],
    patterns: ["push"],
    difficulty: "beginner",
    instructions: [
      "Start in a high plank with hands under shoulders.",
      "Lower chest toward the floor while keeping body straight.",
      "Press back up without sagging hips.",
    ],
    safety: ["Modify on knees or an incline if needed."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000004",
    name: "Incline Dumbbell Press",
    aliases: [],
    primary: ["chest"],
    secondary: ["shoulders", "triceps"],
    equipment: ["dumbbell", "bench"],
    patterns: ["push"],
    difficulty: "intermediate",
    instructions: [
      "Set bench to 30-45 degrees.",
      "Press dumbbells up over upper chest.",
      "Lower with control to shoulder level.",
    ],
    safety: ["Avoid excessive arching of the lower back."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000005",
    name: "Dumbbell Fly",
    aliases: ["chest fly"],
    primary: ["chest"],
    secondary: ["shoulders"],
    equipment: ["dumbbell", "bench"],
    patterns: ["isolation"],
    difficulty: "intermediate",
    instructions: [
      "Lie on a bench with dumbbells over chest.",
      "Open arms in a wide arc with soft elbows.",
      "Squeeze chest to return dumbbells together.",
    ],
    safety: ["Use moderate weight to protect shoulders."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000006",
    name: "Barbell Row",
    aliases: ["bent-over row"],
    primary: ["back", "lats"],
    secondary: ["biceps", "traps"],
    equipment: ["barbell"],
    patterns: ["pull"],
    difficulty: "intermediate",
    instructions: [
      "Hinge at hips with flat back.",
      "Pull bar toward lower ribs.",
      "Lower with control without rounding spine.",
    ],
    safety: ["Brace core and avoid jerking the weight."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000007",
    name: "Pull-Up",
    aliases: ["pull up"],
    primary: ["back", "lats"],
    secondary: ["biceps"],
    equipment: ["pull_up_bar", "bodyweight"],
    patterns: ["pull"],
    difficulty: "intermediate",
    instructions: [
      "Hang from bar with shoulder-width grip.",
      "Pull chest toward bar by driving elbows down.",
      "Lower under control to full hang.",
    ],
    safety: ["Use assistance bands if full reps are not yet available."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000008",
    name: "Lat Pulldown",
    aliases: [],
    primary: ["lats"],
    secondary: ["back", "biceps"],
    equipment: ["cable", "machine"],
    patterns: ["pull"],
    difficulty: "beginner",
    instructions: [
      "Grip bar wider than shoulders.",
      "Pull bar to upper chest while leaning slightly back.",
      "Return with control without shrugging.",
    ],
    safety: ["Avoid pulling behind the neck."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000009",
    name: "Seated Cable Row",
    aliases: [],
    primary: ["back"],
    secondary: ["lats", "biceps"],
    equipment: ["cable", "machine"],
    patterns: ["pull"],
    difficulty: "beginner",
    instructions: [
      "Sit tall with feet braced.",
      "Pull handle toward lower ribs.",
      "Extend arms forward without rounding upper back.",
    ],
    safety: ["Keep torso stable throughout the set."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000010",
    name: "Dumbbell Row",
    aliases: ["single-arm row"],
    primary: ["back", "lats"],
    secondary: ["biceps"],
    equipment: ["dumbbell", "bench"],
    patterns: ["pull"],
    difficulty: "beginner",
    instructions: [
      "Place one knee and hand on bench.",
      "Row dumbbell toward hip.",
      "Lower slowly without twisting torso.",
    ],
    safety: ["Keep neck neutral."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000011",
    name: "Face Pull",
    aliases: [],
    primary: ["shoulders", "traps"],
    secondary: ["back"],
    equipment: ["cable", "resistance_band"],
    patterns: ["pull", "isolation"],
    difficulty: "beginner",
    instructions: [
      "Set cable at face height with rope attachment.",
      "Pull toward face with elbows high.",
      "Externally rotate at end range.",
    ],
    safety: ["Use light load and focus on control."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000012",
    name: "Overhead Press",
    aliases: ["military press"],
    primary: ["shoulders"],
    secondary: ["triceps", "core"],
    equipment: ["barbell"],
    patterns: ["push"],
    difficulty: "intermediate",
    instructions: [
      "Stand with bar at upper chest.",
      "Press bar overhead without excessive lean.",
      "Lower to chin or collarbone with control.",
    ],
    safety: ["Brace core and avoid arching excessively."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000013",
    name: "Dumbbell Shoulder Press",
    aliases: [],
    primary: ["shoulders"],
    secondary: ["triceps"],
    equipment: ["dumbbell"],
    patterns: ["push"],
    difficulty: "beginner",
    instructions: [
      "Start with dumbbells at shoulder height.",
      "Press overhead until arms are extended.",
      "Lower to ear level with control.",
    ],
    safety: ["Do not flare elbows excessively."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000014",
    name: "Lateral Raise",
    aliases: [],
    primary: ["shoulders"],
    secondary: [],
    equipment: ["dumbbell"],
    patterns: ["isolation"],
    difficulty: "beginner",
    instructions: [
      "Stand with dumbbells at sides.",
      "Raise arms to shoulder height with soft elbows.",
      "Lower slowly without swinging.",
    ],
    safety: ["Use lighter weight for strict form."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000015",
    name: "Barbell Back Squat",
    aliases: ["back squat"],
    primary: ["quads", "glutes"],
    secondary: ["core", "hamstrings"],
    equipment: ["barbell"],
    patterns: ["squat"],
    difficulty: "intermediate",
    instructions: [
      "Set bar on upper back and brace core.",
      "Sit hips back and down to comfortable depth.",
      "Drive through mid-foot to stand.",
    ],
    safety: ["Use safety pins or a spotter when needed."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000016",
    name: "Goblet Squat",
    aliases: [],
    primary: ["quads", "glutes"],
    secondary: ["core"],
    equipment: ["kettlebell", "dumbbell"],
    patterns: ["squat"],
    difficulty: "beginner",
    instructions: [
      "Hold weight at chest.",
      "Squat between hips with upright torso.",
      "Stand by driving through full foot.",
    ],
    safety: ["Keep heels down and knees tracking over toes."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000017",
    name: "Romanian Deadlift",
    aliases: ["RDL"],
    primary: ["hamstrings", "glutes"],
    secondary: ["back"],
    equipment: ["barbell", "dumbbell"],
    patterns: ["hinge"],
    difficulty: "intermediate",
    instructions: [
      "Hold weight at hip height with soft knees.",
      "Hinge hips back while keeping bar close to legs.",
      "Return by driving hips forward.",
    ],
    safety: ["Stop when hamstrings limit range without rounding back."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000018",
    name: "Conventional Deadlift",
    aliases: ["deadlift"],
    primary: ["back", "hamstrings", "glutes"],
    secondary: ["traps", "core"],
    equipment: ["barbell"],
    patterns: ["hinge"],
    difficulty: "advanced",
    instructions: [
      "Set bar over mid-foot with flat back.",
      "Drive through floor while keeping bar close.",
      "Stand tall without hyperextending.",
    ],
    safety: ["Use proper bracing and avoid rounded back lifting."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000019",
    name: "Leg Press",
    aliases: [],
    primary: ["quads", "glutes"],
    secondary: ["hamstrings"],
    equipment: ["machine"],
    patterns: ["squat"],
    difficulty: "beginner",
    instructions: [
      "Place feet shoulder-width on platform.",
      "Lower sled with control to comfortable depth.",
      "Press away without locking knees aggressively.",
    ],
    safety: ["Keep lower back in contact with pad."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000020",
    name: "Walking Lunge",
    aliases: [],
    primary: ["quads", "glutes"],
    secondary: ["hamstrings", "core"],
    equipment: ["dumbbell", "bodyweight"],
    patterns: ["lunge"],
    difficulty: "beginner",
    instructions: [
      "Step forward into a long lunge.",
      "Keep front knee over mid-foot.",
      "Push through front heel to stand and alternate.",
    ],
    safety: ["Use support if balance is limited."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000021",
    name: "Bulgarian Split Squat",
    aliases: [],
    primary: ["quads", "glutes"],
    secondary: ["hamstrings"],
    equipment: ["dumbbell", "bench"],
    patterns: ["lunge"],
    difficulty: "intermediate",
    instructions: [
      "Place rear foot on bench behind you.",
      "Lower until front thigh is near parallel.",
      "Drive through front foot to stand.",
    ],
    safety: ["Start bodyweight before adding load."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000022",
    name: "Leg Curl",
    aliases: ["hamstring curl"],
    primary: ["hamstrings"],
    secondary: [],
    equipment: ["machine"],
    patterns: ["isolation"],
    difficulty: "beginner",
    instructions: [
      "Set pad on lower calves.",
      "Curl heels toward glutes.",
      "Lower with control.",
    ],
    safety: ["Avoid lifting hips off pad."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000023",
    name: "Leg Extension",
    aliases: [],
    primary: ["quads"],
    secondary: [],
    equipment: ["machine"],
    patterns: ["isolation"],
    difficulty: "beginner",
    instructions: [
      "Align knee with machine pivot.",
      "Extend legs without locking hard.",
      "Lower slowly to start position.",
    ],
    safety: ["Use moderate load for knee comfort."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000024",
    name: "Standing Calf Raise",
    aliases: ["calf raise"],
    primary: ["calves"],
    secondary: [],
    equipment: ["machine", "bodyweight"],
    patterns: ["isolation"],
    difficulty: "beginner",
    instructions: [
      "Stand on balls of feet at edge of step.",
      "Rise onto toes with full range.",
      "Lower heels below step level with control.",
    ],
    safety: ["Hold support if balance is needed."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000025",
    name: "Hip Thrust",
    aliases: [],
    primary: ["glutes"],
    secondary: ["hamstrings", "core"],
    equipment: ["barbell", "bench"],
    patterns: ["hinge"],
    difficulty: "intermediate",
    instructions: [
      "Place upper back on bench with bar over hips.",
      "Drive hips up until torso is parallel to floor.",
      "Lower with control without hyperextending.",
    ],
    safety: ["Use a pad for bar comfort."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000026",
    name: "Plank",
    aliases: [],
    primary: ["core"],
    secondary: ["shoulders"],
    equipment: ["bodyweight"],
    patterns: ["isolation"],
    difficulty: "beginner",
    instructions: [
      "Hold forearm or high plank with straight line head to heels.",
      "Brace abs and glutes.",
      "Breathe steadily while maintaining position.",
    ],
    safety: ["Stop if lower back sags."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000027",
    name: "Hanging Leg Raise",
    aliases: [],
    primary: ["core"],
    secondary: ["hip_flexors"],
    equipment: ["pull_up_bar"],
    patterns: ["isolation"],
    difficulty: "intermediate",
    instructions: [
      "Hang from bar with shoulders engaged.",
      "Raise legs with control to hip height or higher.",
      "Lower without swinging.",
    ],
    safety: ["Bend knees to reduce difficulty if needed."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000028",
    name: "Cable Crunch",
    aliases: [],
    primary: ["core"],
    secondary: [],
    equipment: ["cable"],
    patterns: ["isolation"],
    difficulty: "beginner",
    instructions: [
      "Kneel facing cable with rope behind head.",
      "Crunch down by flexing spine.",
      "Return with control.",
    ],
    safety: ["Move from mid-back flexion, not neck pulling."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000029",
    name: "Barbell Curl",
    aliases: [],
    primary: ["biceps"],
    secondary: ["forearms"],
    equipment: ["barbell", "ez_bar"],
    patterns: ["isolation"],
    difficulty: "beginner",
    instructions: [
      "Stand with underhand grip on bar.",
      "Curl bar toward shoulders without swinging.",
      "Lower slowly to full extension.",
    ],
    safety: ["Keep elbows close to torso."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000030",
    name: "Dumbbell Curl",
    aliases: [],
    primary: ["biceps"],
    secondary: ["forearms"],
    equipment: ["dumbbell"],
    patterns: ["isolation"],
    difficulty: "beginner",
    instructions: [
      "Stand with dumbbells at sides.",
      "Curl one or both arms with control.",
      "Lower to full extension.",
    ],
    safety: ["Avoid using momentum from hips."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000031",
    name: "Hammer Curl",
    aliases: [],
    primary: ["biceps", "forearms"],
    secondary: [],
    equipment: ["dumbbell"],
    patterns: ["isolation"],
    difficulty: "beginner",
    instructions: [
      "Hold dumbbells neutral grip.",
      "Curl while keeping palms facing each other.",
      "Lower under control.",
    ],
    safety: ["Keep wrists neutral."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000032",
    name: "Triceps Pushdown",
    aliases: ["cable pushdown"],
    primary: ["triceps"],
    secondary: [],
    equipment: ["cable"],
    patterns: ["isolation"],
    difficulty: "beginner",
    instructions: [
      "Stand at cable with elbows at sides.",
      "Extend arms down fully.",
      "Return with control without moving upper arm.",
    ],
    safety: ["Keep shoulders down and stable."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000033",
    name: "Overhead Triceps Extension",
    aliases: [],
    primary: ["triceps"],
    secondary: [],
    equipment: ["dumbbell", "cable"],
    patterns: ["isolation"],
    difficulty: "beginner",
    instructions: [
      "Hold weight overhead with elbows forward.",
      "Lower behind head by bending elbows.",
      "Extend arms to start position.",
    ],
    safety: ["Use manageable load overhead."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000034",
    name: "Skull Crusher",
    aliases: ["lying triceps extension"],
    primary: ["triceps"],
    secondary: [],
    equipment: ["barbell", "ez_bar", "bench"],
    patterns: ["isolation"],
    difficulty: "intermediate",
    instructions: [
      "Lie on bench with arms extended over chest.",
      "Bend elbows to lower bar toward forehead.",
      "Extend arms without flaring elbows wide.",
    ],
    safety: ["Use spotter or moderate load."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000035",
    name: "Parallel Bar Dip",
    aliases: ["dip"],
    primary: ["chest", "triceps"],
    secondary: ["shoulders"],
    equipment: ["bodyweight"],
    patterns: ["push"],
    difficulty: "intermediate",
    instructions: [
      "Support body on parallel bars.",
      "Lower until upper arms are near parallel.",
      "Press back up with control.",
    ],
    safety: ["Use assistance if shoulder discomfort appears."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000036",
    name: "Kettlebell Swing",
    aliases: [],
    primary: ["glutes", "hamstrings"],
    secondary: ["core"],
    equipment: ["kettlebell"],
    patterns: ["hinge", "cardio"],
    difficulty: "intermediate",
    instructions: [
      "Hinge to hike kettlebell back between legs.",
      "Drive hips forward to swing to chest height.",
      "Let bell float down and repeat rhythmically.",
    ],
    safety: ["Power comes from hips, not arms or lower back."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000037",
    name: "Farmer Carry",
    aliases: ["farmers walk"],
    primary: ["core", "forearms"],
    secondary: ["shoulders", "traps"],
    equipment: ["dumbbell", "kettlebell"],
    patterns: ["carry"],
    difficulty: "beginner",
    instructions: [
      "Pick up heavy weights at sides.",
      "Walk tall with shoulders packed.",
      "Maintain steady pace for prescribed distance or time.",
    ],
    safety: ["Keep path clear and grip secure."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000038",
    name: "Bicycle Crunch",
    aliases: [],
    primary: ["core"],
    secondary: ["hip_flexors"],
    equipment: ["bodyweight"],
    patterns: ["rotation"],
    difficulty: "beginner",
    instructions: [
      "Lie on back with hands behind head.",
      "Bring opposite elbow toward knee while extending other leg.",
      "Alternate sides with controlled tempo.",
    ],
    safety: ["Avoid pulling on neck."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000039",
    name: "Mountain Climber",
    aliases: [],
    primary: ["core", "hip_flexors"],
    secondary: ["shoulders"],
    equipment: ["bodyweight"],
    patterns: ["cardio"],
    difficulty: "beginner",
    instructions: [
      "Start in high plank.",
      "Drive knees toward chest alternately.",
      "Keep hips low and core braced.",
    ],
    safety: ["Slow down if form breaks down."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000040",
    name: "Burpee",
    aliases: [],
    primary: ["quads", "chest", "core"],
    secondary: ["shoulders"],
    equipment: ["bodyweight"],
    patterns: ["cardio"],
    difficulty: "intermediate",
    instructions: [
      "Drop to hands and jump feet back to plank.",
      "Perform push-up optional.",
      "Jump feet in and stand with small jump.",
    ],
    safety: ["Step back instead of jumping if needed."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000041",
    name: "Rowing Machine",
    aliases: ["rower"],
    primary: ["back", "quads"],
    secondary: ["core", "biceps"],
    equipment: ["machine"],
    patterns: ["cardio", "pull"],
    difficulty: "beginner",
    instructions: [
      "Drive with legs first then lean back slightly.",
      "Pull handle to lower ribs.",
      "Return in reverse order with control.",
    ],
    safety: ["Maintain smooth stroke rate."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000042",
    name: "Treadmill Run",
    aliases: ["running"],
    primary: ["quads", "calves"],
    secondary: ["hamstrings", "core"],
    equipment: ["machine"],
    patterns: ["cardio"],
    difficulty: "beginner",
    instructions: [
      "Warm up at easy pace.",
      "Maintain upright posture and relaxed shoulders.",
      "Cool down gradually.",
    ],
    safety: ["Use safety clip and appropriate speed."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000043",
    name: "Band Pull-Apart",
    aliases: ["resistance band pull apart"],
    primary: ["shoulders", "back"],
    secondary: ["traps"],
    equipment: ["resistance_band"],
    patterns: ["pull", "isolation"],
    difficulty: "beginner",
    instructions: [
      "Hold band at chest height with arms extended.",
      "Pull band apart by squeezing shoulder blades.",
      "Return with control.",
    ],
    safety: ["Use light band tension for warm-up quality reps."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000044",
    name: "Glute Bridge",
    aliases: [],
    primary: ["glutes"],
    secondary: ["hamstrings", "core"],
    equipment: ["bodyweight"],
    patterns: ["hinge"],
    difficulty: "beginner",
    instructions: [
      "Lie on back with knees bent and feet flat.",
      "Drive hips up by squeezing glutes.",
      "Lower without losing tension at bottom.",
    ],
    safety: ["Avoid overarching lower back at top."],
  },
  {
    id: "b1000001-0000-4000-8000-000000000045",
    name: "Step-Up",
    aliases: [],
    primary: ["quads", "glutes"],
    secondary: ["hamstrings"],
    equipment: ["dumbbell", "bench"],
    patterns: ["lunge"],
    difficulty: "beginner",
    instructions: [
      "Place one foot fully on box or bench.",
      "Drive through front heel to stand on box.",
      "Lower with control and repeat.",
    ],
    safety: ["Choose box height that allows stable knee alignment."],
  },
];

/** Builds the dedupeKey for a curated row using the shared mapper helpers. */
function buildCuratedDedupeKey(name, equipment, primary) {
  return buildExerciseDedupeKey({
    normalizedName: normalizeExerciseName(name),
    equipment,
    primaryMuscles: primary,
  });
}

// ── Build curated SQL rows ────────────────────────────────────────────────────
/** @type {string[]} */
const curatedRows = CURATED.map(
  (ex) => `(
  ${sqlString(ex.id)},
  ${sqlString(ex.name)},
  ${sqlString(normalizeExerciseName(ex.name))},
  ${sqlJson(ex.aliases)},
  ${sqlJson(ex.primary)},
  ${sqlJson(ex.secondary)},
  ${sqlJson(ex.equipment)},
  ${sqlJson(ex.patterns)},
  ${sqlJson(inferExerciseModalitiesFromMovementPatterns(ex.patterns).slice(0, 3))},
  ${sqlString(ex.difficulty)},
  ${sqlJson(ex.instructions)},
  ${sqlJson(ex.safety)},
  ${sqlJson({ refs: [], fallbackLabel: null })},
  'system_seed',
  'validated',
  'active',
  NULL,
  ${sqlString(buildCuratedDedupeKey(ex.name, ex.equipment, ex.primary))}
)`,
);

// ── Load and map free-exercise-db ─────────────────────────────────────────────
const dataPath = join(__dirname, "data/free-exercise-db.json");
const rawData = JSON.parse(readFileSync(dataPath, "utf8"));

/** @type {Map<string, true>} dedupeKeys already registered */
const seenDedupeKeys = new Map();

// Register curated keys first so they win
for (const ex of CURATED) {
  const key = buildCuratedDedupeKey(ex.name, ex.equipment, ex.primary);
  seenDedupeKeys.set(key, true);
}

let mappedCount = 0;
let skippedNull = 0;
let skippedDupe = 0;
/** @type {string[]} */
const freeDbRows = [];

for (let i = 0; i < rawData.length; i++) {
  const record = rawData[i];
  const mapped = mapFreeExerciseDbRecord(record);

  if (!mapped) {
    skippedNull++;
    continue;
  }

  // Validate against schema (throws on error, fails the generator loudly)
  try {
    validateMapped(mapped, mapped.name);
  } catch (err) {
    console.error(`[VALIDATION ERROR] ${err.message}`);
    process.exit(1);
  }

  const { dedupeKey } = mapped;
  if (seenDedupeKeys.has(dedupeKey)) {
    skippedDupe++;
    continue;
  }
  seenDedupeKeys.set(dedupeKey, true);
  mappedCount++;

  const id = freeExerciseDbId(i + 1);
  freeDbRows.push(`(
  ${sqlString(id)},
  ${sqlString(mapped.name)},
  ${sqlString(mapped.normalizedName)},
  ${sqlJson(mapped.aliases)},
  ${sqlJson(mapped.primaryMuscles)},
  ${sqlJson(mapped.secondaryMuscles)},
  ${sqlJson(mapped.equipment)},
  ${sqlJson(mapped.movementPatterns)},
  ${sqlJson(mapped.modalities)},
  ${sqlString(mapped.difficulty)},
  ${sqlJson(mapped.instructions)},
  ${sqlJson(mapped.safetyNotes)},
  ${sqlJson(mapped.media)},
  'free_exercise_db',
  'validated',
  'active',
  NULL,
  ${sqlString(dedupeKey)}
)`);
}

// ── Assemble SQL ──────────────────────────────────────────────────────────────
const allValues = [...curatedRows, ...freeDbRows].join(",\n");
const totalRows = CURATED.length + mappedCount;

const seedSql = `-- Exercise catalog seed.
-- Sources: curated system_seed rows (${CURATED.length}) + free-exercise-db (${mappedCount} mapped).
-- Total rows: ${totalRows}
-- free-exercise-db: yuhonas/free-exercise-db, Unlicense / Public Domain
-- Regenerate via: node packages/db/scripts/generate-exercises-seed.mjs
INSERT INTO exercises (
  id,
  name,
  normalized_name,
  aliases,
  primary_muscles,
  secondary_muscles,
  equipment,
  movement_patterns,
  modalities,
  difficulty,
  instructions,
  safety_notes,
  media,
  source,
  validation_status,
  status,
  user_id,
  dedupe_key
) VALUES
${allValues}
ON CONFLICT (dedupe_key) WHERE user_id IS NULL DO NOTHING;
`;

const outputPath = join(__dirname, "../drizzle/seeds/exercises.sql");
writeFileSync(outputPath, seedSql);

console.log(`\nExercise seed generation complete.`);
console.log(`  Curated (system_seed):   ${CURATED.length}`);
console.log(`  free-exercise-db mapped: ${mappedCount}`);
console.log(`  free-exercise-db skipped (unmappable): ${skippedNull}`);
console.log(`  free-exercise-db skipped (duplicate dedupeKey): ${skippedDupe}`);
console.log(`  Total rows in SQL:       ${totalRows}`);
console.log(`  Wrote → ${outputPath}`);
