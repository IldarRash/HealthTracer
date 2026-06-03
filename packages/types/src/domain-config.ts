import { z } from "zod";
import {
  agentToolNameSchema,
  catalogIntentIdSchema,
  type AgentToolName,
  type CatalogIntentId,
} from "./agent-context.js";
import {
  AGENT_CAPABILITY_CONFIGS,
  AGENT_CAPABILITY_CONFIG_BY_ID,
} from "./capability-config.js";

// ---------------------------------------------------------------------------
// Domain enum
// ---------------------------------------------------------------------------

export const domainConfigDomainSchema = z.enum([
  "workout",
  "nutrition",
  "medical",
  "health",
]);

export type DomainConfigDomain = z.infer<typeof domainConfigDomainSchema>;

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

export const domainIntentEntrySchema = z.object({
  id: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  mapsToCapabilityId: catalogIntentIdSchema,
});

export type DomainIntentEntry = z.infer<typeof domainIntentEntrySchema>;

export const domainSignalEntrySchema = z.object({
  id: z.string().min(1).max(120),
  patterns: z.array(z.string().min(1).max(500)).max(20).optional(),
});

export type DomainSignalEntry = z.infer<typeof domainSignalEntrySchema>;

export const domainPromptEntrySchema = z.object({
  key: z.string().min(1).max(120),
  body: z.string().min(1).max(8000),
  placeholders: z.array(z.string().min(1).max(120)).max(20).optional(),
});

export type DomainPromptEntry = z.infer<typeof domainPromptEntrySchema>;

// ---------------------------------------------------------------------------
// Main per-domain config schema (strict — unknown keys are rejected)
// ---------------------------------------------------------------------------

export const domainConfigSchema = z
  .object({
    domain: domainConfigDomainSchema,
    llmId: z.string().min(1).max(120),
    intents: z.array(domainIntentEntrySchema).max(20).default([]),
    tools: z.array(agentToolNameSchema).max(5).default([]),
    signals: z.array(domainSignalEntrySchema).max(30).default([]),
    prompts: z.array(domainPromptEntrySchema).max(20).default([]),
    safetyNotes: z.array(z.string().min(1).max(500)).max(20).default([]),
  })
  .strict();

export type DomainConfig = z.infer<typeof domainConfigSchema>;

// ---------------------------------------------------------------------------
// Bundle (merged result keyed by domain)
// ---------------------------------------------------------------------------

export type DomainConfigBundle = Readonly<Record<DomainConfigDomain, DomainConfig>>;

// ---------------------------------------------------------------------------
// Load result (mirrors AiBehaviorConfigLoadResult / AttachmentBehaviorConfigLoadResult)
// ---------------------------------------------------------------------------

export type DomainConfigLoadSource = "file" | "defaults";

export type DomainConfigLoadResult = {
  readonly configs: DomainConfigBundle;
  readonly source: DomainConfigLoadSource;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
};

// ---------------------------------------------------------------------------
// Built-in defaults
// ---------------------------------------------------------------------------

const WORKOUT_LLM_ID = "workout_coach" as const;
const NUTRITION_LLM_ID = "nutrition_coach" as const;
const MEDICAL_LLM_ID = "health_coach" as const;
const HEALTH_LLM_ID = "health_coach" as const;

export const DEFAULT_DOMAIN_CONFIGS: DomainConfigBundle = {
  workout: {
    domain: "workout",
    llmId: WORKOUT_LLM_ID,
    intents: [
      {
        id: "create_workout",
        description: "Create a new structured workout plan for the user.",
        mapsToCapabilityId: "adjust_workout",
      },
      {
        id: "adapt_workout",
        description:
          "Adapt or modify the current workout plan based on fatigue, progress, or preferences.",
        mapsToCapabilityId: "adjust_workout",
      },
      {
        id: "review_workout_progress",
        description: "Review recent workout execution and progress trends.",
        mapsToCapabilityId: "review_progress",
      },
    ],
    tools: ["getUserContextSlice", "getWeeklyProgressContext"],
    signals: [
      {
        id: "fatigue",
        patterns: [
          String.raw`\b(tired|fatigue|sore|exhausted|worn\s+out)\b`,
        ],
      },
      {
        id: "pain",
        patterns: [
          String.raw`\b(pain|hurt|injury|injured|ache)\b`,
        ],
      },
      {
        id: "workout_request",
        patterns: [
          String.raw`\b(workout|exercise|training|session|gym|lift|run|cardio)\b`,
        ],
      },
    ],
    prompts: [
      {
        key: "workout_domain_system",
        body: "You are a certified strength and conditioning coach. Review the user's current workout plan and recent execution. Propose structured, evidence-based workout plan changes when warranted. Respect fatigue, pain, and recovery signals. Never diagnose or prescribe medical treatment.",
        placeholders: [],
      },
    ],
    safetyNotes: [
      "Respect reported fatigue, pain, and injury signals — prefer lighter adaptations before rewrites.",
      "Do not prescribe medical treatment or recovery protocols.",
      "Workout proposals must use typed plan revision fields only.",
    ],
  },

  nutrition: {
    domain: "nutrition",
    llmId: NUTRITION_LLM_ID,
    intents: [
      {
        id: "create_nutrition_plan",
        description: "Create a new nutrition or meal plan for the user.",
        mapsToCapabilityId: "adjust_nutrition",
      },
      {
        id: "adjust_nutrition_plan",
        description:
          "Adjust macros, calories, or meal composition in the active nutrition plan.",
        mapsToCapabilityId: "adjust_nutrition",
      },
      {
        id: "log_food",
        description: "Log a nutrition incident or meal from a photo or description.",
        mapsToCapabilityId: "adjust_nutrition",
      },
      {
        id: "recommend_recipes",
        description: "Suggest recipes aligned with the user's nutrition goals.",
        mapsToCapabilityId: "adjust_nutrition",
      },
    ],
    tools: ["getUserContextSlice", "getWeeklyProgressContext"],
    signals: [
      {
        id: "meal_reference",
        patterns: [
          String.raw`\b(meal|food|eat|diet|calories|protein|carb|fat|macro|recipe|nutrition)\b`,
        ],
      },
      {
        id: "hunger",
        patterns: [
          String.raw`\b(hungry|hunger|starving|appetite)\b`,
        ],
      },
    ],
    prompts: [
      {
        key: "nutrition_domain_system",
        body: "You are a registered dietitian coach. Review the user's nutrition plan and recent adherence. Propose typed nutrition plan adjustments, recipe recommendations, or meal incident logs when appropriate. Keep calorie estimates clearly approximate. Do not provide medical diet prescriptions or diagnose eating disorders.",
        placeholders: [],
      },
    ],
    safetyNotes: [
      "Do not provide medical diet prescriptions or eating disorder guidance.",
      "Keep calorie and macro estimates clearly approximate and editable.",
      "Nutrition incident proposals must remain reviewable before applying.",
    ],
  },

  medical: {
    domain: "medical",
    llmId: MEDICAL_LLM_ID,
    intents: [
      {
        id: "review_health_context",
        description:
          "Provide conservative wellness coaching informed by consent-approved health document summaries.",
        mapsToCapabilityId: "ask_health_context",
      },
    ],
    tools: ["getDocumentContext", "getUserContextSlice"],
    signals: [
      {
        id: "medical_reference",
        patterns: [
          String.raw`\b(lab|blood\s+test|report|diagnosis|doctor|physician|medical|health\s+document)\b`,
        ],
      },
      {
        id: "symptoms",
        patterns: [
          String.raw`\b(symptom|pain|dizzy|nausea|fever|breathing|chest)\b`,
        ],
      },
    ],
    prompts: [
      {
        key: "medical_domain_system",
        body: "You are a wellness coach reviewing consent-approved health document summaries. Provide conservative coaching context only. Never diagnose, interpret labs as medical treatment guidance, or prescribe treatment. Refer the user to their healthcare provider for medical questions. Use only approved document summaries — never raw document contents.",
        placeholders: [],
      },
    ],
    safetyNotes: [
      "Never diagnose, prescribe treatment, or interpret labs as medical guidance.",
      "Use only consent-approved document summaries — never raw document contents.",
      "Medical document save is a consent-gated proposal; never auto-persist health_documents.",
      "Direct users to their healthcare provider for medical questions.",
    ],
  },

  health: {
    domain: "health",
    llmId: HEALTH_LLM_ID,
    intents: [
      {
        id: "general_health_context",
        description:
          "Answer general wellness and health context questions using approved user data.",
        mapsToCapabilityId: "ask_health_context",
      },
      {
        id: "longevity_coaching",
        description: "Provide long-term wellness direction and habit coaching.",
        mapsToCapabilityId: "longevity_overview",
      },
    ],
    // getDocumentContext is intentionally omitted: longevity_overview (one of the two
    // intents in this domain) does not allow getDocumentContext. Keeping it here
    // causes intersectDomainConfigWithCatalog to emit a warning on every load.
    // Document context for health questions is handled by the medical domain config.
    tools: ["getUserContextSlice"],
    signals: [
      {
        id: "health_question",
        patterns: [
          String.raw`\b(health|wellness|longevity|habit|stress|sleep|mental|recovery)\b`,
        ],
      },
    ],
    prompts: [
      {
        key: "health_domain_system",
        body: "You are a holistic wellness coach. Focus on sustainable habits, recovery, sleep, stress management, and long-term healthspan. Use approved user health context conservatively. Never diagnose, prescribe treatment, or make medical-certainty claims.",
        placeholders: [],
      },
    ],
    safetyNotes: [
      "Do not diagnose or prescribe medical treatment.",
      "Avoid medical-certainty language for health context.",
      "Use consent-approved document summaries only.",
    ],
  },
} as const satisfies DomainConfigBundle;

// ---------------------------------------------------------------------------
// Catalog intersection helpers
// ---------------------------------------------------------------------------

/** All valid tool names from the catalog. */
const CATALOG_TOOL_SET = new Set<AgentToolName>(
  agentToolNameSchema.options as readonly AgentToolName[],
);

/** All valid capability ids from the catalog. */
const CATALOG_CAPABILITY_ID_SET = new Set<CatalogIntentId>(
  AGENT_CAPABILITY_CONFIGS.map((c) => c.capabilityId),
);

/**
 * Validate and narrow a domain config against the capability catalog.
 *
 * - Drops any `tools` entry not in the catalog and records a warning.
 * - Drops any `intents` entry whose `mapsToCapabilityId` is not a real
 *   `CatalogIntentId` and records a warning.
 * - Never widens: only the intersection of YAML-declared and catalog is kept.
 */
export function intersectDomainConfigWithCatalog(
  config: DomainConfig,
  warnings: string[],
): DomainConfig {
  const filteredTools: AgentToolName[] = [];

  for (const tool of config.tools) {
    if (CATALOG_TOOL_SET.has(tool)) {
      filteredTools.push(tool);
    } else {
      warnings.push(
        `domain=${config.domain}: tool "${tool}" is not in the capability catalog and was dropped.`,
      );
    }
  }

  const filteredIntents: DomainIntentEntry[] = [];

  for (const intent of config.intents) {
    if (CATALOG_CAPABILITY_ID_SET.has(intent.mapsToCapabilityId)) {
      // Also validate that the referenced capability actually allows the
      // declared tool set (informational warning only — not a hard rejection).
      const cap = AGENT_CAPABILITY_CONFIG_BY_ID[intent.mapsToCapabilityId];

      if (cap) {
        const capToolSet = new Set<AgentToolName>(
          cap.allowedTools as readonly AgentToolName[],
        );

        for (const tool of filteredTools) {
          if (!capToolSet.has(tool)) {
            warnings.push(
              `domain=${config.domain} intent="${intent.id}": tool "${tool}" is not in ` +
                `the allowedTools for capability "${intent.mapsToCapabilityId}".`,
            );
          }
        }
      }

      filteredIntents.push(intent);
    } else {
      warnings.push(
        `domain=${config.domain} intent="${intent.id}": mapsToCapabilityId "${intent.mapsToCapabilityId}" is not a real CatalogIntentId and was dropped.`,
      );
    }
  }

  return {
    ...config,
    tools: filteredTools,
    intents: filteredIntents,
  };
}
