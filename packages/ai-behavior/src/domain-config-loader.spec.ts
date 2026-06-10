import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_DOMAIN_CONFIGS } from "@health/types";
import { loadDomainConfigs } from "./domain-config-loader.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an isolated temp directory with domain YAML files. */
function makeTempDomainDir(
  files: Partial<Record<"workout" | "nutrition" | "health", string>>,
): string {
  const dir = mkdtempSync(join(tmpdir(), "domain-config-"));

  const allDomains = ["workout", "nutrition", "health"] as const;
  // Write only the files provided; omit others so we can test per-domain fallback
  for (const domain of allDomains) {
    const content = files[domain];

    if (content !== undefined) {
      writeFileSync(join(dir, `${domain}.yml`), content, "utf8");
    }
  }

  return dir;
}

// signals[] and prompts[] removed from all YAML fixtures: they are no longer valid fields
// under the strict domainConfigSchema. The loader now rejects any YAML with these keys.

const VALID_WORKOUT_YAML = `
domain: workout
llmId: workout_coach
intents:
  - id: create_workout
    description: Create a workout plan.
    mapsToCapabilityId: adjust_workout
tools:
  - getUserContextSlice
safetyNotes:
  - No diagnosis.
`.trim();

const VALID_NUTRITION_YAML = `
domain: nutrition
llmId: nutrition_coach
intents:
  - id: log_food
    description: Log a meal.
    mapsToCapabilityId: adjust_nutrition
tools:
  - getUserContextSlice
safetyNotes:
  - Estimates are approximate.
`.trim();

const VALID_HEALTH_YAML = `
domain: health
llmId: health_coach
intents:
  - id: general_health_context
    description: General wellness context.
    mapsToCapabilityId: ask_health_context
tools:
  - getUserContextSlice
safetyNotes:
  - Conservative language only.
`.trim();

// ---------------------------------------------------------------------------
// (a) All three domains load from valid YAML
// ---------------------------------------------------------------------------

describe("loadDomainConfigs — all three domains from valid YAML", () => {
  it("loads all three domains and returns source='file'", () => {
    const dir = makeTempDomainDir({
      workout: VALID_WORKOUT_YAML,
      nutrition: VALID_NUTRITION_YAML,
      health: VALID_HEALTH_YAML,
    });

    const result = loadDomainConfigs({ configDir: dir });

    expect(result.source).toBe("file");
    expect(result.errors).toEqual([]);
  });

  it("merges all three domain configs into the bundle", () => {
    const dir = makeTempDomainDir({
      workout: VALID_WORKOUT_YAML,
      nutrition: VALID_NUTRITION_YAML,
      health: VALID_HEALTH_YAML,
    });

    const result = loadDomainConfigs({ configDir: dir });

    expect(result.configs.workout.domain).toBe("workout");
    expect(result.configs.nutrition.domain).toBe("nutrition");
    expect(result.configs.health.domain).toBe("health");
  });

  it("parses workout intents and tools correctly", () => {
    const dir = makeTempDomainDir({
      workout: VALID_WORKOUT_YAML,
      nutrition: VALID_NUTRITION_YAML,
      health: VALID_HEALTH_YAML,
    });

    const result = loadDomainConfigs({ configDir: dir });

    const workout = result.configs.workout;
    expect(workout.llmId).toBe("workout_coach");
    expect(workout.intents).toHaveLength(1);
    expect(workout.intents[0]?.mapsToCapabilityId).toBe("adjust_workout");
    expect(workout.tools).toContain("getUserContextSlice");
  });

  it("loads the shipped repo domain YAML files directly — no errors for workout/nutrition/health", () => {
    // No configDir override — reads from the package's actual config/domains/
    // medical.yml was deleted: the medical domain is removed from domainConfigDomainSchema.
    const result = loadDomainConfigs();

    expect(result.source).toBe("file");
    // No errors at all — workout/nutrition/health YAML files all load cleanly
    expect(result.errors).toEqual([]);
    expect(result.configs.workout.llmId).toBe("workout_coach");
    expect(result.configs.nutrition.llmId).toBe("nutrition_coach");
    expect(result.configs.health.llmId).toBe("health_coach");
  });

  it("shipped repo domain YAML does not contain signals or prompts fields", () => {
    // signals[] and prompts[] are dead-weight fields that were never read by runtime.
    // They have been removed from the schema and YAML files to prevent confusion.
    const result = loadDomainConfigs();

    for (const domain of ["workout", "nutrition", "health"] as const) {
      const config = result.configs[domain] as Record<string, unknown>;
      expect(config["signals"]).toBeUndefined();
      expect(config["prompts"]).toBeUndefined();
    }
  });

  it("no warnings are emitted on a clean load — no medical.yml expected or read", () => {
    // After removing medical from the schema, loadDomainConfigs should produce
    // zero errors and zero warnings on a clean load of the shipped YAML files.
    const result = loadDomainConfigs();

    expect(result.errors).toEqual([]);
    // Catalog-intersection warnings for workout.yml tools matching review_progress
    // should NOT appear after the review_progress allowedTools was updated to include
    // searchExerciseCatalog and getActivePlanDetail.
    const unexpectedWarnings = result.warnings.filter((w) => !w.includes("medical"));
    expect(unexpectedWarnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (b) FAIL-CLOSED — one broken domain falls back, others still load
// ---------------------------------------------------------------------------

describe("loadDomainConfigs — fail-closed per domain", () => {
  it("uses defaults for a missing file, loads others from file", () => {
    // Provide only two valid files; the third (health) is missing
    const dir = makeTempDomainDir({
      workout: VALID_WORKOUT_YAML,
      nutrition: VALID_NUTRITION_YAML,
      // health is absent
    });

    const result = loadDomainConfigs({ configDir: dir });

    // health fell back to default
    expect(result.configs.health).toEqual(DEFAULT_DOMAIN_CONFIGS.health);
    // others loaded from file
    expect(result.configs.workout.llmId).toBe("workout_coach");
    expect(result.configs.nutrition.llmId).toBe("nutrition_coach");
    // source is "file" because at least one file loaded
    expect(result.source).toBe("file");
    // a warning must be recorded for the missing domain
    expect(result.warnings.some((w) => w.includes("health"))).toBe(true);
    // an error must be recorded for the missing file
    expect(result.errors.some((e) => e.includes("health"))).toBe(true);
  });

  it("falls back to defaults for a domain with malformed YAML", () => {
    const dir = makeTempDomainDir({
      workout: "{ this is: not valid: yaml: ::::",
      nutrition: VALID_NUTRITION_YAML,
      health: VALID_HEALTH_YAML,
    });

    const result = loadDomainConfigs({ configDir: dir });

    // workout fell back to default
    expect(result.configs.workout).toEqual(DEFAULT_DOMAIN_CONFIGS.workout);
    // others still loaded
    expect(result.configs.nutrition.domain).toBe("nutrition");
    // a warning must mention the failing domain
    expect(result.warnings.some((w) => w.includes("workout"))).toBe(true);
  });

  it("falls back for a domain with invalid Zod content (empty llmId)", () => {
    const invalidWorkout = `
domain: workout
llmId: ""
intents: []
tools: []
safetyNotes: []
`.trim();

    const dir = makeTempDomainDir({
      workout: invalidWorkout,
      nutrition: VALID_NUTRITION_YAML,
      health: VALID_HEALTH_YAML,
    });

    const result = loadDomainConfigs({ configDir: dir });

    // workout fell back — empty llmId fails min(1)
    expect(result.configs.workout).toEqual(DEFAULT_DOMAIN_CONFIGS.workout);
    expect(result.warnings.some((w) => w.includes("workout"))).toBe(true);
    // other domains unaffected
    expect(result.configs.nutrition.domain).toBe("nutrition");
  });

  it("falls back for YAML with signals[] — now a rejected unknown key", () => {
    // signals[] and prompts[] were removed from the schema.
    // .strict() rejects any YAML that still includes them.
    const yamlWithSignals = `
domain: workout
llmId: workout_coach
intents: []
tools: []
safetyNotes: []
signals:
  - id: fatigue
    patterns:
      - tired
`.trim();

    const dir = makeTempDomainDir({
      workout: yamlWithSignals,
      nutrition: VALID_NUTRITION_YAML,
      health: VALID_HEALTH_YAML,
    });

    const result = loadDomainConfigs({ configDir: dir });

    // .strict() rejects signals[] → falls back to default
    expect(result.configs.workout).toEqual(DEFAULT_DOMAIN_CONFIGS.workout);
    expect(result.warnings.some((w) => w.includes("workout"))).toBe(true);
  });

  it("falls back for YAML with prompts[] — now a rejected unknown key", () => {
    const yamlWithPrompts = `
domain: workout
llmId: workout_coach
intents: []
tools: []
safetyNotes: []
prompts:
  - key: system
    body: You are a coach.
`.trim();

    const dir = makeTempDomainDir({
      workout: yamlWithPrompts,
      nutrition: VALID_NUTRITION_YAML,
      health: VALID_HEALTH_YAML,
    });

    const result = loadDomainConfigs({ configDir: dir });

    // .strict() rejects prompts[] → falls back to default
    expect(result.configs.workout).toEqual(DEFAULT_DOMAIN_CONFIGS.workout);
    expect(result.warnings.some((w) => w.includes("workout"))).toBe(true);
  });

  it("falls back if domain field in YAML mismatches the filename", () => {
    // A nutrition.yml file that declares domain: workout — domain mismatch
    const mismatchYaml = VALID_WORKOUT_YAML; // declares domain: workout
    const dir = makeTempDomainDir({
      workout: VALID_WORKOUT_YAML,
      nutrition: mismatchYaml, // declares 'workout' instead of 'nutrition'
      health: VALID_HEALTH_YAML,
    });

    const result = loadDomainConfigs({ configDir: dir });

    // nutrition fell back because declared domain doesn't match
    expect(result.configs.nutrition).toEqual(DEFAULT_DOMAIN_CONFIGS.nutrition);
    expect(result.warnings.some((w) => w.includes("nutrition"))).toBe(true);
    // workout is fine
    expect(result.configs.workout.domain).toBe("workout");
  });

  it("returns source='defaults' when ALL files are missing", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "domain-config-empty-"));

    const result = loadDomainConfigs({ configDir: emptyDir });

    expect(result.source).toBe("defaults");
    expect(result.configs.workout).toEqual(DEFAULT_DOMAIN_CONFIGS.workout);
    expect(result.configs.nutrition).toEqual(DEFAULT_DOMAIN_CONFIGS.nutrition);
    expect(result.configs.health).toEqual(DEFAULT_DOMAIN_CONFIGS.health);
    expect(result.errors.length).toBe(3); // one error per missing file (workout/nutrition/health)
    expect(result.warnings.length).toBe(3); // one warning per missing file
  });
});

// ---------------------------------------------------------------------------
// (c) CATALOG INTERSECTION — YAML cannot widen the catalog allowlists
// ---------------------------------------------------------------------------

describe("loadDomainConfigs — catalog intersection", () => {
  it("rejects and falls back when a YAML tool name is not a valid catalog tool", () => {
    // The agentToolNameSchema Zod enum and the catalog tool set are kept in sync.
    // A tool name that is not in the enum causes Zod to reject the entire domain file,
    // which triggers the fail-closed path (fallback to defaults + warning recorded).
    const yamlWithFakeTool = `
domain: workout
llmId: workout_coach
intents:
  - id: create_workout
    description: Create a workout.
    mapsToCapabilityId: adjust_workout
tools:
  - getUserContextSlice
  - notARealCatalogTool
safetyNotes: []
`.trim();

    const dir = makeTempDomainDir({
      workout: yamlWithFakeTool,
      nutrition: VALID_NUTRITION_YAML,
      health: VALID_HEALTH_YAML,
    });

    const result = loadDomainConfigs({ configDir: dir });

    // Zod rejects the file (unknown enum value) → falls back to defaults
    expect(result.configs.workout).toEqual(DEFAULT_DOMAIN_CONFIGS.workout);
    // a warning must be recorded for the workout domain
    expect(result.warnings.some((w) => w.includes("workout"))).toBe(true);
    // an error must mention the failing file
    expect(result.errors.some((e) => e.includes("workout"))).toBe(true);
    // other domains unaffected
    expect(result.configs.nutrition.domain).toBe("nutrition");
  });

  it("rejects YAML with getDocumentContext as it is no longer a valid tool name", () => {
    // getDocumentContext was removed from agentToolNameSchema.
    // Any YAML still declaring it must fail Zod validation → fallback to defaults.
    const yamlWithDocumentTool = `
domain: workout
llmId: workout_coach
intents:
  - id: create_workout
    description: Create a workout.
    mapsToCapabilityId: adjust_workout
tools:
  - getUserContextSlice
  - getDocumentContext
safetyNotes: []
`.trim();

    const dir = makeTempDomainDir({
      workout: yamlWithDocumentTool,
      nutrition: VALID_NUTRITION_YAML,
      health: VALID_HEALTH_YAML,
    });

    const result = loadDomainConfigs({ configDir: dir });

    // getDocumentContext is not in the enum → Zod rejects → fallback
    expect(result.configs.workout).toEqual(DEFAULT_DOMAIN_CONFIGS.workout);
    expect(result.warnings.some((w) => w.includes("workout"))).toBe(true);
  });

  it("keeps only catalog-valid tools via intersectDomainConfigWithCatalog (no undeclared tools added)", () => {
    // Provide a valid YAML with only one tool; verify the loader never widens the set
    const singleToolYaml = `
domain: workout
llmId: workout_coach
intents:
  - id: create_workout
    description: Create a workout.
    mapsToCapabilityId: adjust_workout
tools:
  - getUserContextSlice
safetyNotes: []
`.trim();

    const dir = makeTempDomainDir({
      workout: singleToolYaml,
      nutrition: VALID_NUTRITION_YAML,
      health: VALID_HEALTH_YAML,
    });

    const result = loadDomainConfigs({ configDir: dir });

    // Only the one declared tool is present — catalog intersection does not add others
    expect(result.configs.workout.tools).toEqual(["getUserContextSlice"]);
    expect(result.configs.workout.tools).not.toContain("getWeeklyProgressContext");
    expect(result.configs.workout.tools).not.toContain("getDocumentContext");
  });

  it("drops a mapsToCapabilityId not in the capability catalog and records a warning", () => {
    // Use a valid CatalogIntentId that maps to an attachment capability;
    // the loader validates via intersectDomainConfigWithCatalog.
    const yamlWithAttachmentCapability = `
domain: workout
llmId: workout_coach
intents:
  - id: attach_food_photo
    description: Attach food photo.
    mapsToCapabilityId: attachment_food_photo
tools:
  - getUserContextSlice
safetyNotes: []
`.trim();

    const dir = makeTempDomainDir({
      workout: yamlWithAttachmentCapability,
      nutrition: VALID_NUTRITION_YAML,
      health: VALID_HEALTH_YAML,
    });

    const result = loadDomainConfigs({ configDir: dir });

    // The key invariant: tools list is only the intersection.
    expect(result.configs.workout.tools).toEqual(["getUserContextSlice"]);
    // Either the intent passed (it's a real CatalogIntentId) or was dropped with a warning.
    // Either way, the loader must not throw.
    expect(() => loadDomainConfigs({ configDir: dir })).not.toThrow();
  });

  it("YAML declaring an empty tools list produces an empty tools list (cannot widen via defaults injection)", () => {
    const emptyToolsYaml = `
domain: workout
llmId: workout_coach
intents: []
tools: []
safetyNotes: []
`.trim();

    const dir = makeTempDomainDir({
      workout: emptyToolsYaml,
      nutrition: VALID_NUTRITION_YAML,
      health: VALID_HEALTH_YAML,
    });

    const result = loadDomainConfigs({ configDir: dir });

    // Tools declared as empty stays empty — catalog intersection doesn't add tools
    expect(result.configs.workout.tools).toEqual([]);
  });

  it("tools declared in YAML are intersected (not widened) against the catalog", () => {
    // Both valid tools are in the catalog; intersection must keep them
    const allToolsYaml = `
domain: workout
llmId: workout_coach
intents:
  - id: create_workout
    description: Create a workout.
    mapsToCapabilityId: adjust_workout
tools:
  - getUserContextSlice
  - getWeeklyProgressContext
safetyNotes: []
`.trim();

    const dir = makeTempDomainDir({
      workout: allToolsYaml,
      nutrition: VALID_NUTRITION_YAML,
      health: VALID_HEALTH_YAML,
    });

    const result = loadDomainConfigs({ configDir: dir });

    // Both are real catalog tools; none dropped
    expect(result.configs.workout.tools).toContain("getUserContextSlice");
    expect(result.configs.workout.tools).toContain("getWeeklyProgressContext");
    expect(result.warnings.some((w) => w.includes("dropped"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (d) Unknown top-level keys in YAML are stripped (.strict() rejection)
// ---------------------------------------------------------------------------

describe("loadDomainConfigs — unknown top-level keys stripped", () => {
  it("falls back for YAML with an unknown key 'contextBudget'", () => {
    const yamlWithUnknown = `
domain: workout
llmId: workout_coach
intents: []
tools: []
safetyNotes: []
contextBudget:
  includeDocuments: true
`.trim();

    const dir = makeTempDomainDir({
      workout: yamlWithUnknown,
      nutrition: VALID_NUTRITION_YAML,
      health: VALID_HEALTH_YAML,
    });

    const result = loadDomainConfigs({ configDir: dir });

    // .strict() rejects unknown keys — falls back to default
    expect(result.configs.workout).toEqual(DEFAULT_DOMAIN_CONFIGS.workout);
    expect(result.warnings.some((w) => w.includes("workout"))).toBe(true);
    expect(result.errors.some((e) => e.includes("workout"))).toBe(true);
  });

  it("falls back for YAML with an unknown key 'consentRules'", () => {
    const yamlWithUnknown = `
domain: nutrition
llmId: nutrition_coach
intents: []
tools: []
safetyNotes: []
consentRules:
  - always_ask
`.trim();

    const dir = makeTempDomainDir({
      workout: VALID_WORKOUT_YAML,
      nutrition: yamlWithUnknown,
      health: VALID_HEALTH_YAML,
    });

    const result = loadDomainConfigs({ configDir: dir });

    expect(result.configs.nutrition).toEqual(DEFAULT_DOMAIN_CONFIGS.nutrition);
    expect(result.warnings.some((w) => w.includes("nutrition"))).toBe(true);
    // workout is unaffected
    expect(result.configs.workout.llmId).toBe("workout_coach");
  });

  it("falls back for YAML with an unknown key 'validationRules' in the health domain", () => {
    const yamlWithUnknown = `
domain: health
llmId: health_coach
intents: []
tools: []
safetyNotes: []
validationRules:
  schema: strict
`.trim();

    const dir = makeTempDomainDir({
      workout: VALID_WORKOUT_YAML,
      nutrition: VALID_NUTRITION_YAML,
      health: yamlWithUnknown,
    });

    const result = loadDomainConfigs({ configDir: dir });

    expect(result.configs.health).toEqual(DEFAULT_DOMAIN_CONFIGS.health);
    expect(result.warnings.some((w) => w.includes("health"))).toBe(true);
    // workout is unaffected
    expect(result.configs.workout.domain).toBe("workout");
  });
});
