import { z } from "zod";
import type {
  AgentIntent,
  AgentToolName,
  AttachmentCatalogIntentId,
  CatalogIntentId,
  ContextSliceRequest,
} from "./agent-context.js";
import {
  agentIntentSchema,
  agentToolNameSchema,
  buildContextSliceRequestForIntent,
  catalogIntentIdSchema,
} from "./agent-context.js";
import type { ClassifiedChatAttachmentCategory } from "./chat-attachment-classification.js";
import {
  DEFAULT_ATTACHMENT_ROUTING_POLICY,
  resolvePrimaryAttachmentCatalogIntentFromRouting,
  type AttachmentRoutingPolicy,
} from "./attachment-routing-resolver.js";

const PROPOSAL_INTENT_VALUES = [
  "update_profile",
  "create_goal",
  "update_goal",
  "create_workout_plan",
  "adapt_workout_plan",
  "adapt_workout_plan_from_progress",
  "create_nutrition_plan",
  "adjust_nutrition_plan",
  "recommend_recipes",
  "create_today_checklist",
  "summarize_progress",
  "create_habit_plan",
  "adapt_habit_plan",
  "capture_wellbeing_checkin",
  "log_nutrition_incident",
] as const;

export type CatalogProposalIntent = (typeof PROPOSAL_INTENT_VALUES)[number];

const catalogProposalIntentSchema = z.enum(PROPOSAL_INTENT_VALUES);

export type { AttachmentCatalogIntentId, CatalogIntentId } from "./agent-context.js";
export { catalogIntentIdSchema } from "./agent-context.js";

export const intentCatalogKindSchema = z.enum(["normal", "attachment_family"]);

export type IntentCatalogKind = z.infer<typeof intentCatalogKindSchema>;

export const intentCatalogEntrySchema = z.object({
  id: catalogIntentIdSchema,
  kind: intentCatalogKindSchema,
  description: z.string().min(1).max(500),
  routerGuidance: z.string().min(1).max(1000),
  examples: z.array(z.string().min(1).max(240)).max(8),
  defaultContextSlice: z.object({
    type: z.string(),
    depth: z.string().optional(),
    timeRange: z.string().optional(),
    includeDocuments: z.boolean().optional(),
  }),
  allowedTools: z.array(agentToolNameSchema).max(5),
  allowedProposalIntents: z.array(catalogProposalIntentSchema).max(15),
  safetyGuidance: z.array(z.string().min(1).max(240)).max(10),
  promptInstructions: z.string().min(1).max(4000),
  mappedAgentIntent: agentIntentSchema,
});

export type IntentCatalogEntry = z.infer<typeof intentCatalogEntrySchema>;

const WORKOUT_PROPOSAL_INTENTS = [
  "create_workout_plan",
  "adapt_workout_plan",
  "adapt_workout_plan_from_progress",
] as const satisfies readonly CatalogProposalIntent[];

const NUTRITION_PROPOSAL_INTENTS = [
  "create_nutrition_plan",
  "adjust_nutrition_plan",
  "recommend_recipes",
  "log_nutrition_incident",
] as const satisfies readonly CatalogProposalIntent[];

const HABIT_PROPOSAL_INTENTS = [
  "create_habit_plan",
  "adapt_habit_plan",
] as const satisfies readonly CatalogProposalIntent[];

const TODAY_PROPOSAL_INTENTS = [
  "create_today_checklist",
  "capture_wellbeing_checkin",
] as const satisfies readonly CatalogProposalIntent[];

const PROGRESS_PROPOSAL_INTENTS = [
  "summarize_progress",
  "adapt_workout_plan_from_progress",
  "adjust_nutrition_plan",
  "adapt_habit_plan",
] as const satisfies readonly CatalogProposalIntent[];

export const AGENT_INTENT_CATALOG: readonly IntentCatalogEntry[] = [
  {
    id: "general",
    kind: "normal",
    description: "General wellness coaching, habits, motivation, and open questions.",
    routerGuidance:
      "Use when the user asks for general advice, education, or guidance that does not clearly fit workout, nutrition, progress review, longevity, health documents, or today planning.",
    examples: [
      "How can I stay consistent this week?",
      "Explain progressive overload.",
      "What helps with recovery between sessions?",
    ],
    defaultContextSlice: buildContextSliceRequestForIntent("general"),
    allowedTools: ["getUserContextSlice"],
    allowedProposalIntents: ["update_profile", "create_goal", "update_goal"],
    safetyGuidance: [
      "Prefer advice-only responses unless a typed proposal is clearly warranted.",
      "Do not diagnose or prescribe treatment.",
    ],
    promptInstructions:
      "Coach the user with concise, actionable wellness guidance. Use proposals sparingly for profile or goal updates only when explicitly requested.",
    mappedAgentIntent: "general",
  },
  {
    id: "ask_about_today",
    kind: "normal",
    description: "Daily check-in, today planning, and immediate action suggestions.",
    routerGuidance:
      "Use when the user asks what to do today, wants a daily checklist, or references this morning or today's plan.",
    examples: [
      "What should I do today?",
      "Help me plan today.",
      "Create a checklist for today.",
    ],
    defaultContextSlice: buildContextSliceRequestForIntent("ask_about_today"),
    allowedTools: ["getUserContextSlice"],
    allowedProposalIntents: [...TODAY_PROPOSAL_INTENTS],
    safetyGuidance: [
      "Keep today suggestions realistic for the user's current constraints.",
      "Do not overwrite existing plans without a proposal.",
    ],
    promptInstructions:
      "Focus on today's actionable steps, wellbeing check-ins, and a concise daily checklist when appropriate.",
    mappedAgentIntent: "ask_about_today",
  },
  {
    id: "adjust_workout",
    kind: "normal",
    description: "Workout plan creation, adaptation, fatigue-aware training changes.",
    routerGuidance:
      "Use for training, gym, exercise, session planning, load changes, soreness, or skipping workouts.",
    examples: [
      "Can you adapt my workout plan?",
      "Should I train today if I feel sore?",
      "Make my program lighter this week.",
    ],
    defaultContextSlice: buildContextSliceRequestForIntent("adjust_workout"),
    allowedTools: ["getUserContextSlice", "getWeeklyProgressContext"],
    allowedProposalIntents: [...WORKOUT_PROPOSAL_INTENTS],
    safetyGuidance: [
      "Respect fatigue, pain, and recovery signals.",
      "Prefer lighter adaptations before major plan rewrites.",
    ],
    promptInstructions:
      "Review active workout context and recent execution. Propose typed workout plan changes only when a structured revision is warranted.",
    mappedAgentIntent: "adjust_workout",
  },
  {
    id: "adjust_nutrition",
    kind: "normal",
    description: "Nutrition planning, macros, meals, recipes, and food logging guidance.",
    routerGuidance:
      "Use for meals, calories, macros, protein, diet changes, hunger, or recipe ideas tied to the user's plan.",
    examples: [
      "Adjust my nutrition plan for more protein.",
      "What should I eat for dinner?",
      "Suggest recipes for my plan.",
    ],
    defaultContextSlice: buildContextSliceRequestForIntent("adjust_nutrition"),
    allowedTools: ["getUserContextSlice", "getWeeklyProgressContext"],
    allowedProposalIntents: [...NUTRITION_PROPOSAL_INTENTS],
    safetyGuidance: [
      "Do not provide medical diet prescriptions.",
      "Keep nutrition incident logging editable and reviewable.",
    ],
    promptInstructions:
      "Use active nutrition context and recent adherence. Recommend recipes or plan adjustments through typed proposals when appropriate.",
    mappedAgentIntent: "adjust_nutrition",
  },
  {
    id: "review_progress",
    kind: "normal",
    description: "Weekly review, progress summaries, and cross-domain trend interpretation.",
    routerGuidance:
      "Use when the user asks for weekly progress, how their week went, or a progress review.",
    examples: [
      "How was my week?",
      "Summarize my weekly progress.",
      "Review my training and nutrition this week.",
    ],
    defaultContextSlice: buildContextSliceRequestForIntent("review_progress"),
    allowedTools: ["getWeeklyProgressContext", "getUserContextSlice"],
    allowedProposalIntents: [...PROGRESS_PROPOSAL_INTENTS],
    safetyGuidance: [
      "Explain trends conservatively when data is partial or insufficient.",
      "Do not claim medical conclusions from progress data.",
    ],
    promptInstructions:
      "Summarize weekly trends first, then optionally propose plan adjustments grounded in observed progress.",
    mappedAgentIntent: "review_progress",
  },
  {
    id: "longevity_overview",
    kind: "normal",
    description: "Long-term wellness direction, habit systems, and longevity-focused coaching.",
    routerGuidance:
      "Use for long-term healthspan, habit systems, longevity direction, or sustained behavior design.",
    examples: [
      "Help me build better long-term habits.",
      "What should I focus on for longevity?",
      "Adjust my habit plan.",
    ],
    defaultContextSlice: buildContextSliceRequestForIntent("longevity_overview"),
    allowedTools: ["getUserContextSlice"],
    allowedProposalIntents: [...HABIT_PROPOSAL_INTENTS, "create_goal", "update_goal"],
    safetyGuidance: [
      "Avoid medical longevity claims or treatment language.",
      "Prefer small sustainable habit changes.",
    ],
    promptInstructions:
      "Connect coaching to the user's direction, goals, and active habit plan. Propose habit plan changes through typed proposals.",
    mappedAgentIntent: "longevity_overview",
  },
  {
    id: "ask_health_context",
    kind: "normal",
    description: "Consent-gated health document context and medical background questions.",
    routerGuidance:
      "Use when the user references labs, medical reports, symptoms, or stored health documents outside attachment uploads.",
    examples: [
      "Please consider my lab results.",
      "What does my blood test mean for training?",
      "Review my medical background.",
    ],
    defaultContextSlice: buildContextSliceRequestForIntent("ask_health_context"),
    allowedTools: ["getDocumentContext", "getUserContextSlice"],
    allowedProposalIntents: [],
    safetyGuidance: [
      "Never diagnose or interpret labs as medical treatment guidance.",
      "Use only consent-approved document summaries.",
      "Do not expose raw document contents.",
    ],
    promptInstructions:
      "Explain document-aware coaching conservatively using approved summaries only. Do not create state-changing proposals from medical documents.",
    mappedAgentIntent: "ask_health_context",
  },
  {
    id: "proposal_explainer",
    kind: "normal",
    description: "Explicit requests to explain why a stored proposal was suggested.",
    routerGuidance:
      "Rule-routed only for explicit proposal explanation requests. Do not select via the generic text router.",
    examples: [
      "Why this proposal?",
      "Why did you suggest this change?",
      "Explain this proposal.",
      "Почему ты предложил это?",
    ],
    defaultContextSlice: buildContextSliceRequestForIntent("proposal_explainer"),
    allowedTools: [],
    allowedProposalIntents: [],
    safetyGuidance: [
      "Explain using stored proposal rationale and bounded evidence labels only.",
      "Do not create new proposals or mutate plans.",
      "Do not diagnose or prescribe treatment.",
      "Do not expose raw document contents.",
    ],
    promptInstructions:
      "The user is asking why a specific prior proposal was made. Explain using the proposalExplainer context: title, reason, and evidence summaries. Stay supportive and coaching-oriented. Do not create proposals or suggest applying changes in this turn.",
    mappedAgentIntent: "proposal_explainer",
  },
  {
    id: "attachment_food_photo",
    kind: "attachment_family",
    description: "Food photo or meal image attachment for nutrition logging and meal review.",
    routerGuidance:
      "Selected automatically for food photo attachments. Do not use the generic text router for these turns.",
    examples: ["User shared a meal photo.", "User attached a food image with optional meal note."],
    defaultContextSlice: buildContextSliceRequestForIntent("adjust_nutrition"),
    allowedTools: ["getUserContextSlice"],
    allowedProposalIntents: ["log_nutrition_incident"],
    safetyGuidance: [
      "Treat recognition output as provisional until the user approves a proposal.",
      "Keep macro estimates editable and clearly estimated.",
    ],
    promptInstructions:
      "Review attachment recognition context included in the turn. Explain what you see and support nutrition incident logging through proposals when recognition is sufficient.",
    mappedAgentIntent: "adjust_nutrition",
  },
  {
    id: "attachment_workout",
    kind: "attachment_family",
    description: "Workout plan, training log, or activity attachment recognition.",
    routerGuidance:
      "Selected automatically for workout attachment uploads. Do not use the generic text router for these turns.",
    examples: ["User shared a workout plan file.", "User attached a training session export."],
    defaultContextSlice: buildContextSliceRequestForIntent("adjust_workout"),
    allowedTools: ["getUserContextSlice", "getWeeklyProgressContext"],
    allowedProposalIntents: [...WORKOUT_PROPOSAL_INTENTS, "create_today_checklist"],
    safetyGuidance: [
      "Do not apply extracted workout data directly to active plans.",
      "Prefer reviewable workout proposals or manual fallback guidance.",
      "Do not suggest a full workout plan for a one-off session logged for today.",
    ],
    promptInstructions:
      "Use attachment recognition context to explain extracted workout details. For plan documents, propose structured plan updates. For one-off sessions the user asked to log for today, reference the prepared Today checklist proposal briefly and avoid unrelated full-plan suggestions.",
    mappedAgentIntent: "adjust_workout",
  },
  {
    id: "attachment_medical_document",
    kind: "attachment_family",
    description: "Medical document attachment flow with consent and provider isolation.",
    routerGuidance:
      "Selected automatically for medical document attachments. Do not use the generic text router for these turns.",
    examples: ["User uploaded a lab report PDF.", "User shared a medical document screenshot."],
    defaultContextSlice: buildContextSliceRequestForIntent("ask_health_context"),
    allowedTools: ["getDocumentContext"],
    allowedProposalIntents: [],
    safetyGuidance: [
      "Medical attachments require consent before entering coaching context.",
      "Never create proposals from medical documents.",
      "Do not diagnose or prescribe based on uploaded documents.",
      "Direct the user to Profile consent when documents are not approved.",
    ],
    promptInstructions:
      "Explain attachment status and consent requirements. Use approved document summaries only. Provide conservative wellness context without medical certainty.",
    mappedAgentIntent: "ask_health_context",
  },
] as const;

export const AGENT_INTENT_CATALOG_BY_ID: Readonly<Record<CatalogIntentId, IntentCatalogEntry>> =
  Object.fromEntries(AGENT_INTENT_CATALOG.map((entry) => [entry.id, entry])) as Record<
    CatalogIntentId,
    IntentCatalogEntry
  >;

export function getIntentCatalogEntry(catalogIntentId: CatalogIntentId): IntentCatalogEntry {
  const entry = AGENT_INTENT_CATALOG_BY_ID[catalogIntentId];

  if (!entry) {
    throw new Error(`Unknown catalog intent id: ${catalogIntentId}`);
  }

  return entry;
}

export function listRouterCatalogEntries(): IntentCatalogEntry[] {
  return AGENT_INTENT_CATALOG.filter(
    (entry) => entry.kind === "normal" && entry.id !== "proposal_explainer",
  );
}

export function isCatalogIntentId(value: string): value is CatalogIntentId {
  return catalogIntentIdSchema.safeParse(value).success;
}

export function resolveAttachmentCatalogIntentId(
  category: ClassifiedChatAttachmentCategory,
  routing: AttachmentRoutingPolicy = DEFAULT_ATTACHMENT_ROUTING_POLICY,
): AttachmentCatalogIntentId {
  return routing.categoryToCapability[category];
}

export function resolvePrimaryAttachmentCatalogIntentId(input: {
  categories: ReadonlyArray<ClassifiedChatAttachmentCategory>;
  routing?: AttachmentRoutingPolicy;
}): AttachmentCatalogIntentId {
  return resolvePrimaryAttachmentCatalogIntentFromRouting(
    input.routing ?? DEFAULT_ATTACHMENT_ROUTING_POLICY,
    input.categories,
  );
}

export function getAllowedToolsForCatalogIntent(
  catalogIntentId: CatalogIntentId,
): readonly AgentToolName[] {
  return getIntentCatalogEntry(catalogIntentId).allowedTools;
}

export function getAllowedProposalIntentsForCatalogIntent(
  catalogIntentId: CatalogIntentId,
): readonly CatalogProposalIntent[] {
  return getIntentCatalogEntry(catalogIntentId).allowedProposalIntents;
}

export function getDefaultContextSliceForCatalogIntent(
  catalogIntentId: CatalogIntentId,
): ContextSliceRequest {
  const entry = getIntentCatalogEntry(catalogIntentId);
  return buildContextSliceRequestForIntent(entry.mappedAgentIntent);
}

export function resolveMappedAgentIntent(catalogIntentId: CatalogIntentId): AgentIntent {
  return getIntentCatalogEntry(catalogIntentId).mappedAgentIntent;
}

export function serializeIntentCatalogForRouter(
  entries: ReadonlyArray<IntentCatalogEntry> = listRouterCatalogEntries(),
): Array<{
  id: CatalogIntentId;
  description: string;
  routerGuidance: string;
  examples: readonly string[];
}> {
  return entries.map((entry) => ({
    id: entry.id,
    description: entry.description,
    routerGuidance: entry.routerGuidance,
    examples: entry.examples,
  }));
}

export function filterProposalsToAllowedIntents<T extends { intent: CatalogProposalIntent }>(
  allowedProposalIntents: ReadonlyArray<CatalogProposalIntent>,
  proposals: ReadonlyArray<T>,
): T[] {
  const allowed = new Set(allowedProposalIntents);

  return proposals.filter((proposal) => allowed.has(proposal.intent));
}

export function filterProposalsToCatalogAllowlist<T extends { intent: CatalogProposalIntent }>(
  catalogIntentId: CatalogIntentId,
  proposals: ReadonlyArray<T>,
): T[] {
  return filterProposalsToAllowedIntents(
    getAllowedProposalIntentsForCatalogIntent(catalogIntentId),
    proposals,
  );
}
