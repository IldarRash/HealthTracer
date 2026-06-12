/**
 * llm-emission — per-intent LLM emission Zod schemas.
 *
 * These schemas describe exactly what a domain LLM may EMIT as a candidate
 * proposal payload on the OpenAI strict structured-output wire. They are
 * intentionally narrower and more LLM-friendly than the canonical proposal
 * payload contracts (ai-proposal.ts), which remain the source of truth:
 *
 *   emission shape ── ProposalNormalizationService / pure normalizers ──▶
 *   canonical shape ── ProposalValidationService ──▶ persisted proposal
 *
 * Strict-mode compatibility is guaranteed BY CONSTRUCTION:
 *  - `.strict()` objects only (every object emits additionalProperties:false)
 *  - NO `.optional()` — optional fields are `.nullable()` (the provider's
 *    stripExplicitNulls turns null into "absent" before the canonical parse)
 *  - no `.default()`, no transforms, no refine/superRefine, no z.record
 *  - no min/max bounds — the canonical schemas own all bounds
 *
 * `toOpenAiStrictJsonSchema` (apps/api) converts these to OpenAI strict JSON
 * schemas and ASSERTS the construction rules, so drift fails loudly in tests.
 *
 * Coverage notes (intents WITHOUT an emission schema fall back to the
 * permissive strict:false domain-step wire schema — no behavior cliff):
 *  - update_profile / create_goal / update_goal / save_body_analysis /
 *    create_habit_plan / adapt_habit_plan / create_today_checklist /
 *    summarize_progress are uncovered: they are not part of the workout /
 *    nutrition fan-out prompt contracts today (they ride on general /
 *    longevity / today capabilities) and several have complex or
 *    server-owned payloads (e.g. records, correlation evidence).
 *  - adjust_nutrition_plan covers only the plan-payload union arm; the
 *    from-progress wrapper arm is produced by deterministic weekly-review
 *    packing, not by free-chat domain LLMs.
 */

import { z } from "zod";
import { proposalTargetDomainSchema } from "../ai-proposal.js";
import {
  adaptWorkoutPlanFromProgressLlmEmissionSchema,
  logWorkoutActivityLlmEmissionSchema,
  workoutPlanLlmEmissionSchema,
} from "./workout.js";
import {
  logNutritionIncidentLlmEmissionSchema,
  nutritionPlanLlmEmissionSchema,
  recommendRecipesLlmEmissionSchema,
} from "./nutrition.js";
import { captureWellbeingCheckinLlmEmissionSchema } from "./wellbeing.js";

export * from "./workout.js";
export * from "./nutrition.js";
export * from "./wellbeing.js";

// ---------------------------------------------------------------------------
// Registry — intent → emission payload schema
// ---------------------------------------------------------------------------

export const LLM_EMISSION_PAYLOAD_SCHEMAS = {
  create_workout_plan: workoutPlanLlmEmissionSchema,
  adapt_workout_plan: workoutPlanLlmEmissionSchema,
  adapt_workout_plan_from_progress: adaptWorkoutPlanFromProgressLlmEmissionSchema,
  log_workout_activity: logWorkoutActivityLlmEmissionSchema,
  create_nutrition_plan: nutritionPlanLlmEmissionSchema,
  adjust_nutrition_plan: nutritionPlanLlmEmissionSchema,
  recommend_recipes: recommendRecipesLlmEmissionSchema,
  log_nutrition_incident: logNutritionIncidentLlmEmissionSchema,
  capture_wellbeing_checkin: captureWellbeingCheckinLlmEmissionSchema,
} as const;

export type LlmEmissionCoveredIntent = keyof typeof LLM_EMISSION_PAYLOAD_SCHEMAS;

export const LLM_EMISSION_COVERED_INTENTS = Object.keys(
  LLM_EMISSION_PAYLOAD_SCHEMAS,
) as readonly LlmEmissionCoveredIntent[];

export function hasLlmEmissionSchemaForIntent(
  intent: string,
): intent is LlmEmissionCoveredIntent {
  return Object.prototype.hasOwnProperty.call(LLM_EMISSION_PAYLOAD_SCHEMAS, intent);
}

// ---------------------------------------------------------------------------
// Candidate envelope
//
// Matches what a domain_answer.candidateProposals[] entry must carry for the
// selection-by-id flow: ActionResolver resolves code-assigned candidate ids
// back to these entries and parses them with rawAiProposalSchema downstream.
//
// NO `id` field: candidate ids (`cand_<domain>_<index>`) are assigned in code
// by DomainLlmExecutorService.buildCandidateMap — the LLM never invents them.
// `evidenceRefs` is omitted: correlation evidence is server-derived.
// ---------------------------------------------------------------------------

export function buildLlmCandidateEnvelopeSchema(intent: LlmEmissionCoveredIntent) {
  return z
    .object({
      intent: z.literal(intent),
      targetDomain: proposalTargetDomainSchema,
      title: z.string(),
      reason: z.string(),
      proposedChanges: LLM_EMISSION_PAYLOAD_SCHEMAS[intent],
    })
    .strict();
}
