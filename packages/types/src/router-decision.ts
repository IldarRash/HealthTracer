import { z } from "zod";
import {
  agentSafetyFlagSchema,
  agentToolNameSchema,
  type AgentSafetyFlag,
  type AgentToolName,
} from "./agent-context.js";
import { messagePreprocessorResultSchema } from "./message-preprocessor.js";
import { ROUTER_TEXT_MAX_CHARS } from "./message-limits.js";

// ---------------------------------------------------------------------------
// Domain enum (only the three LLM domains; medical folds into health)
// ---------------------------------------------------------------------------

export const routerDomainSchema = z.enum(["workout", "nutrition", "health"]);

export type RouterDomain = z.infer<typeof routerDomainSchema>;

/** Maximum number of domains the router may select per turn. */
export const MAX_ROUTER_SELECTED_DOMAINS = 3 as const;

/** Maximum hints of each kind (intent/tool/signal) kept per selected domain. */
export const MAX_ROUTER_HINTS_PER_DOMAIN = 5 as const;

// ---------------------------------------------------------------------------
// Per-domain selection entry
// ---------------------------------------------------------------------------

// Caps are enforced by slicing IN-SCHEMA, never by rejection: a router LLM that
// emits 6 valid hints (or 4 valid domains) must degrade to the cap, not fail
// the whole parse and dump the turn onto the fallback route. The element
// validations (known domain/tool names, hint length) still reject as before.
const routerHintListSchema = z
  .array(z.string().min(1).max(240))
  .default([])
  .transform((hints) => hints.slice(0, MAX_ROUTER_HINTS_PER_DOMAIN));

export const routerSelectedDomainSchema = z.object({
  domain: routerDomainSchema,
  confidence: z.number().min(0).max(1),
  intentHints: routerHintListSchema,
  toolHints: z
    .array(agentToolNameSchema)
    .default([])
    .transform((hints) => hints.slice(0, MAX_ROUTER_HINTS_PER_DOMAIN)),
  signalHints: routerHintListSchema,
});

export type RouterSelectedDomain = z.infer<typeof routerSelectedDomainSchema>;

// ---------------------------------------------------------------------------
// Optional direct-command signal (parallel to TurnDecision directCommand)
// ---------------------------------------------------------------------------

export const routerDirectCommandSchema = z.object({
  detected: z.boolean(),
  kind: z
    .enum(["today_summary_read", "mark_today_workout_done"])
    .nullable()
    .optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type RouterDirectCommand = z.infer<typeof routerDirectCommandSchema>;

// ---------------------------------------------------------------------------
// RouterDecisionRequest
// ---------------------------------------------------------------------------

// The router receives attachment presence + category only.
// mimeType and consentState are not routing signals and are never supplied
// to the router by the orchestrator.
export const routerAttachmentHintSchema = z.object({
  category: z.string().min(1).max(80),
});

export type RouterAttachmentHint = z.infer<typeof routerAttachmentHintSchema>;

export const routerRecentMessageHintSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(ROUTER_TEXT_MAX_CHARS),
});

export type RouterRecentMessageHint = z.infer<
  typeof routerRecentMessageHintSchema
>;

export const routerAvailableDomainSchema = z.object({
  domain: routerDomainSchema,
  capabilityIds: z.array(z.string().min(1).max(80)).max(10).default([]),
  intentSummaries: z
    .array(z.string().min(1).max(240))
    .max(10)
    .default([]),
});

export type RouterAvailableDomain = z.infer<typeof routerAvailableDomainSchema>;

export const routerDecisionRequestSchema = z.object({
  originalText: z.string().min(1).max(ROUTER_TEXT_MAX_CHARS),
  normalizedText: z.string().min(1).max(ROUTER_TEXT_MAX_CHARS),
  detectedLanguage: z.string().min(1).max(20).optional(),
  preprocessor: messagePreprocessorResultSchema,
  attachmentHints: z.array(routerAttachmentHintSchema).max(5).default([]),
  recentMessageHints: z
    .array(routerRecentMessageHintSchema)
    .max(10)
    .default([]),
  availableDomains: z
    .array(routerAvailableDomainSchema)
    .max(MAX_ROUTER_SELECTED_DOMAINS)
    .default([]),
  safetyGuardrails: z.array(z.string().min(1).max(500)).max(10).default([]),
});

export type RouterDecisionRequest = z.infer<typeof routerDecisionRequestSchema>;

// ---------------------------------------------------------------------------
// RouterDecisionOutput (.strict() — LLM output shape)
// ---------------------------------------------------------------------------

export const routerDecisionOutputSchema = z
  .object({
    // Sliced in-schema (same rationale as the hint lists above): 4 valid
    // domains degrade to the top 3, never to a whole-parse failure.
    selectedDomains: z
      .array(routerSelectedDomainSchema)
      .default([])
      .transform((domains) => domains.slice(0, MAX_ROUTER_SELECTED_DOMAINS)),
    directCommand: routerDirectCommandSchema.optional(),
    safetyFlags: z.array(agentSafetyFlagSchema).max(10).default([]),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type RouterDecisionOutput = z.infer<typeof routerDecisionOutputSchema>;
export type RouterDecisionOutputInput = z.input<typeof routerDecisionOutputSchema>;

// ---------------------------------------------------------------------------
// Forbidden-key guard (mirrors validateTurnDecisionOutputShape)
// Router must NEVER emit user-facing reply text, proposals, or tool calls.
// ---------------------------------------------------------------------------

const ROUTER_DECISION_FORBIDDEN_KEYS = [
  "reply",
  "text",
  "message",
  "advice",
  "recommendation",
  "answer",
  "response",
  "proposals",
  "proposal",
  "userMessage",
  "coachingText",
  "finalAnswer",
  "tool",
  "tool_request",
  "kind",
  "catalogIntentId",
  "requiredContextSlices",
  "expectedResponseMode",
  "routingMethod",
  "capabilityHints",
  "routeCapabilityHints",
  "needsContext",
] as const;

export function validateRouterDecisionOutputShape(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return ["Router decision output must be an object."];
  }

  const errors: string[] = [];

  for (const key of ROUTER_DECISION_FORBIDDEN_KEYS) {
    if (key in (value as Record<string, unknown>)) {
      errors.push(
        `Router decision output must not include forbidden field "${key}".`,
      );
    }
  }

  const parsed = routerDecisionOutputSchema.safeParse(value);

  if (!parsed.success) {
    errors.push(...parsed.error.issues.map((issue) => issue.message));
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Clamp helper
// Caps selectedDomains to MAX_ROUTER_SELECTED_DOMAINS and strips unknown domains.
// Never rejects — always returns a safe (possibly degraded) output.
// ---------------------------------------------------------------------------

export function clampRouterDecisionOutput(
  output: RouterDecisionOutput,
  allowedDomains: ReadonlySet<RouterDomain> = new Set(
    routerDomainSchema.options as RouterDomain[],
  ),
  allowedTools: ReadonlySet<AgentToolName> = new Set(
    agentToolNameSchema.options as AgentToolName[],
  ),
  allowedSafetyFlags: ReadonlySet<AgentSafetyFlag> = new Set(
    agentSafetyFlagSchema.options as AgentSafetyFlag[],
  ),
): RouterDecisionOutput {
  const clampedDomains = output.selectedDomains
    .filter((entry) => allowedDomains.has(entry.domain))
    .slice(0, MAX_ROUTER_SELECTED_DOMAINS)
    .map((entry) => ({
      ...entry,
      toolHints: entry.toolHints
        .filter((t): t is AgentToolName => allowedTools.has(t as AgentToolName))
        .slice(0, MAX_ROUTER_HINTS_PER_DOMAIN),
    }));

  const clampedSafetyFlags = output.safetyFlags.filter((f): f is AgentSafetyFlag =>
    allowedSafetyFlags.has(f as AgentSafetyFlag),
  );

  return routerDecisionOutputSchema.parse({
    ...output,
    selectedDomains: clampedDomains,
    safetyFlags: clampedSafetyFlags,
    confidence: Math.min(1, Math.max(0, output.confidence)),
  });
}

// ---------------------------------------------------------------------------
// Fallback factory — returned when provider output fails validation
// ---------------------------------------------------------------------------

export function createFallbackRouterDecision(): RouterDecisionOutput {
  return routerDecisionOutputSchema.parse({
    selectedDomains: [],
    safetyFlags: [],
    confidence: 0,
  });
}
