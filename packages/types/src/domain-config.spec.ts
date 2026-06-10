import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOMAIN_CONFIGS,
  domainConfigSchema,
  intersectDomainConfigWithCatalog,
  type DomainConfig,
} from "./domain-config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalWorkoutConfig(overrides?: Partial<DomainConfig>): DomainConfig {
  return {
    domain: "workout",
    llmId: "workout_coach",
    intents: [
      {
        id: "create_workout",
        description: "Create a workout plan.",
        mapsToCapabilityId: "adjust_workout",
      },
    ],
    tools: ["getUserContextSlice"],
    safetyNotes: ["No diagnosis."],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Schema parsing — happy path
// ---------------------------------------------------------------------------

describe("domainConfigSchema", () => {
  it("parses a valid workout config", () => {
    const result = domainConfigSchema.safeParse(makeMinimalWorkoutConfig());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.domain).toBe("workout");
      expect(result.data.tools).toEqual(["getUserContextSlice"]);
      expect(result.data.intents[0]?.mapsToCapabilityId).toBe("adjust_workout");
    }
  });

  it("parses a valid nutrition config", () => {
    const raw = {
      domain: "nutrition",
      llmId: "nutrition_coach",
      intents: [
        {
          id: "log_food",
          description: "Log a meal.",
          mapsToCapabilityId: "adjust_nutrition",
        },
      ],
      tools: ["getUserContextSlice", "getWeeklyProgressContext"],
      safetyNotes: ["Estimates are approximate."],
    };

    const result = domainConfigSchema.safeParse(raw);

    expect(result.success).toBe(true);
  });

  it("parses a valid health config", () => {
    const raw = {
      domain: "health",
      llmId: "health_coach",
      intents: [
        {
          id: "longevity_coaching",
          description: "Long-term wellness direction.",
          mapsToCapabilityId: "longevity_overview",
        },
      ],
      tools: ["getUserContextSlice"],
      safetyNotes: ["Conservative language only."],
    };

    const result = domainConfigSchema.safeParse(raw);

    expect(result.success).toBe(true);
  });

  it("applies array defaults when optional arrays are missing", () => {
    const raw = {
      domain: "workout",
      llmId: "workout_coach",
      // intents/tools/safetyNotes omitted — all have defaults
    };

    const result = domainConfigSchema.safeParse(raw);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.intents).toEqual([]);
      expect(result.data.tools).toEqual([]);
      expect(result.data.safetyNotes).toEqual([]);
    }
  });

  it("rejects signals[] as an unknown key (.strict())", () => {
    const raw = {
      ...makeMinimalWorkoutConfig(),
      signals: [{ id: "fatigue", patterns: ["tired"] }],
    };

    const result = domainConfigSchema.safeParse(raw);

    expect(result.success).toBe(false);
  });

  it("rejects prompts[] as an unknown key (.strict())", () => {
    const raw = {
      ...makeMinimalWorkoutConfig(),
      prompts: [{ key: "system", body: "You are a coach." }],
    };

    const result = domainConfigSchema.safeParse(raw);

    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // .strict() — unknown keys must be rejected
  // -------------------------------------------------------------------------

  it("rejects unknown top-level keys (.strict())", () => {
    const raw = {
      ...makeMinimalWorkoutConfig(),
      contextBudget: { includeDocuments: true }, // MUST be rejected
    };

    const result = domainConfigSchema.safeParse(raw);

    expect(result.success).toBe(false);
  });

  it("rejects an unknown top-level key named 'consentRules'", () => {
    const raw = {
      ...makeMinimalWorkoutConfig(),
      consentRules: ["always_ask"],
    };

    const result = domainConfigSchema.safeParse(raw);

    expect(result.success).toBe(false);
  });

  it("rejects an unknown top-level key named 'validationRules'", () => {
    const raw = {
      ...makeMinimalWorkoutConfig(),
      validationRules: { schema: "strict" },
    };

    const result = domainConfigSchema.safeParse(raw);

    expect(result.success).toBe(false);
  });

  it("rejects an unknown top-level key named 'crisis'", () => {
    const raw = {
      ...makeMinimalWorkoutConfig(),
      crisis: { enabled: true },
    };

    const result = domainConfigSchema.safeParse(raw);

    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Field validation failures
  // -------------------------------------------------------------------------

  it("rejects missing domain field", () => {
    const { domain: _domain, ...rest } = makeMinimalWorkoutConfig();
    const result = domainConfigSchema.safeParse(rest);

    expect(result.success).toBe(false);
  });

  it("rejects missing llmId field", () => {
    const { llmId: _llmId, ...rest } = makeMinimalWorkoutConfig();
    const result = domainConfigSchema.safeParse(rest);

    expect(result.success).toBe(false);
  });

  it("rejects an invalid domain value", () => {
    const result = domainConfigSchema.safeParse({
      ...makeMinimalWorkoutConfig(),
      domain: "finance", // not a valid DomainConfigDomain
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid mapsToCapabilityId value", () => {
    const result = domainConfigSchema.safeParse({
      ...makeMinimalWorkoutConfig(),
      intents: [
        {
          id: "bad_intent",
          description: "Bad.",
          mapsToCapabilityId: "not_a_real_capability_id_xyz",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid tool name", () => {
    const result = domainConfigSchema.safeParse({
      ...makeMinimalWorkoutConfig(),
      tools: ["nonExistentTool"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects getDocumentContext as an invalid tool name (removed from enum)", () => {
    const result = domainConfigSchema.safeParse({
      ...makeMinimalWorkoutConfig(),
      tools: ["getDocumentContext"],
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Default configs are all individually valid
// ---------------------------------------------------------------------------

describe("DEFAULT_DOMAIN_CONFIGS", () => {
  const domains = ["workout", "nutrition", "health"] as const;

  for (const domain of domains) {
    it(`default config for '${domain}' passes the schema`, () => {
      const result = domainConfigSchema.safeParse(DEFAULT_DOMAIN_CONFIGS[domain]);

      expect(result.success).toBe(true);
    });

    it(`default config for '${domain}' has the correct domain field`, () => {
      expect(DEFAULT_DOMAIN_CONFIGS[domain].domain).toBe(domain);
    });

    it(`default config for '${domain}' has a non-empty llmId`, () => {
      expect(DEFAULT_DOMAIN_CONFIGS[domain].llmId.length).toBeGreaterThan(0);
    });

    it(`default config for '${domain}' has at least one safety note`, () => {
      expect(DEFAULT_DOMAIN_CONFIGS[domain].safetyNotes.length).toBeGreaterThan(0);
    });
  }

  it("no domain default config contains getDocumentContext", () => {
    for (const domain of domains) {
      const config = DEFAULT_DOMAIN_CONFIGS[domain];
      expect(config.tools).not.toContain("getDocumentContext");
    }
  });

  it("'medical' domain no longer exists in DEFAULT_DOMAIN_CONFIGS or domainConfigDomainSchema", () => {
    // After removal: medical was merged into health. No medical key should be present.
    expect(Object.keys(DEFAULT_DOMAIN_CONFIGS)).not.toContain("medical");

    const parsed = domainConfigSchema.safeParse({
      domain: "medical",
      llmId: "health_coach",
      intents: [],
      tools: [],
      safetyNotes: [],
    });
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// intersectDomainConfigWithCatalog
// ---------------------------------------------------------------------------

describe("intersectDomainConfigWithCatalog", () => {
  it("keeps tools that are in the catalog", () => {
    const warnings: string[] = [];
    const config = makeMinimalWorkoutConfig({ tools: ["getUserContextSlice"] });
    const result = intersectDomainConfigWithCatalog(config, warnings);

    expect(result.tools).toEqual(["getUserContextSlice"]);
    expect(warnings).toEqual([]);
  });

  it("drops a tool not in the catalog and records a warning", () => {
    const warnings: string[] = [];
    const config = makeMinimalWorkoutConfig({
      tools: ["getUserContextSlice", "notARealTool" as never],
    });
    const result = intersectDomainConfigWithCatalog(config, warnings);

    expect(result.tools).toEqual(["getUserContextSlice"]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("notARealTool");
    expect(warnings[0]).toContain("dropped");
  });

  it("keeps intents whose mapsToCapabilityId is in the catalog", () => {
    const warnings: string[] = [];
    const config = makeMinimalWorkoutConfig({
      intents: [
        { id: "create_workout", description: "Create.", mapsToCapabilityId: "adjust_workout" },
      ],
    });
    const result = intersectDomainConfigWithCatalog(config, warnings);

    expect(result.intents).toHaveLength(1);
    expect(result.intents[0]?.mapsToCapabilityId).toBe("adjust_workout");
  });

  it("drops an intent whose mapsToCapabilityId is NOT in the catalog and records a warning", () => {
    const warnings: string[] = [];
    // Manually corrupt a mapsToCapabilityId post-schema-parse to test runtime drop
    const hacked = {
      ...makeMinimalWorkoutConfig(),
      intents: [
        { id: "bad_intent", description: "Fake.", mapsToCapabilityId: "FAKE_CAP" as never },
        { id: "ok_intent", description: "Good.", mapsToCapabilityId: "adjust_workout" as const },
      ],
    };
    const result = intersectDomainConfigWithCatalog(hacked, warnings);

    expect(result.intents).toHaveLength(1);
    expect(result.intents[0]?.id).toBe("ok_intent");
    expect(warnings.some((w) => w.includes("FAKE_CAP"))).toBe(true);
    expect(warnings.some((w) => w.includes("dropped"))).toBe(true);
  });

  it("passes through safetyNotes unchanged", () => {
    const warnings: string[] = [];
    const config = makeMinimalWorkoutConfig({ safetyNotes: ["No diagnosis.", "Be conservative."] });
    const result = intersectDomainConfigWithCatalog(config, warnings);

    expect(result.safetyNotes).toEqual(config.safetyNotes);
  });

  it("YAML can only narrow — does not add tools not already declared", () => {
    const warnings: string[] = [];
    const config = makeMinimalWorkoutConfig({ tools: [] });
    const result = intersectDomainConfigWithCatalog(config, warnings);

    // Empty tools stays empty; catalog intersection cannot widen
    expect(result.tools).toEqual([]);
  });
});
