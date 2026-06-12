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

// DomainSignalEntry and DomainPromptEntry removed: signals[] and prompts[] are
// parsed from YAML but never read by any runtime service. Live fan-out domain
// prompts come from prompt-template-defaults.ts; direct-path signals live in
// message-preprocessor.ts. These schema fields were dead weight.

// ---------------------------------------------------------------------------
// Main per-domain config schema (strict — unknown keys are rejected)
// ---------------------------------------------------------------------------

export const domainConfigSchema = z
  .object({
    domain: domainConfigDomainSchema,
    llmId: z.string().min(1).max(120),
    intents: z.array(domainIntentEntrySchema).max(20).default([]),
    // Cap = the full catalog of agent tool names: YAML narrows the catalog, so a
    // valid narrowing can legitimately list every catalog tool. A tighter cap
    // (the old 5) made the schema reject narrowings the runtime would accept.
    tools: z.array(agentToolNameSchema).max(agentToolNameSchema.options.length).default([]),
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
    safetyNotes: [
      "Do not provide medical diet prescriptions or eating disorder guidance.",
      "Keep calorie and macro estimates clearly approximate and editable.",
      "Nutrition incident proposals must remain reviewable before applying.",
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
    tools: ["getUserContextSlice"],
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
