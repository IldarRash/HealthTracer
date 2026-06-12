/**
 * nutrition-incident-normalization.ts
 *
 * Pure normalization for raw `log_nutrition_incident` proposal payloads emitted
 * by the LLM, bridging known shape variance into the canonical
 * `logNutritionIncidentProposalPayloadSchema` form BEFORE validation runs.
 *
 * Trust model: stamped values (image refs, provenance source, incident time)
 * come from SERVER turn state (`ctx`), never from LLM authority. The full
 * validation stack still runs on the normalized payload afterwards — this
 * helper bridges shape, it does not relax validation.
 *
 * Nutritional content (items, calories, macros, confidence) is never touched.
 */

import { isoDateTimeSchema } from "./dates.js";
import { nutritionProvenanceLabelSchema } from "./nutrition-incidents.js";

export interface NutritionIncidentNormalizationContext {
  /** Server-side "now" for this turn, ISO-8601 UTC. */
  nowIso: string;
  /** Trusted ids of the image attachments uploaded on this turn (may be empty). */
  imageAttachmentIds: readonly string[];
}

const MAX_IMAGE_REFS = 5;
const PAST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // nowIso − 7 days
const FUTURE_WINDOW_MS = 12 * 60 * 60 * 1000; // nowIso + 12 hours
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalize a raw `log_nutrition_incident` proposedChanges payload:
 *
 * - `imageRefs`: UUID-string entries are coerced to `{ id }` objects. When the
 *   turn has image attachments, the array is REPLACED entirely with the trusted
 *   attachment ids (capped at 5) — the LLM has no authority over image refs.
 * - `provenance.source`: missing/unknown values are stamped from turn state
 *   (`vision_llm_estimate` when images are present, else `text_estimate`).
 *   `food_photo_analysis`/`dev_stub` are coerced to `vision_llm_estimate` when
 *   images are present (no analysis records exist on the LLM path). Valid
 *   non-photo values (`user_manual`, `text_estimate`, `recipe_recommendation`)
 *   are left alone.
 * - `incidentDateTime`: missing/unparseable/date-only values, or datetimes
 *   outside `[nowIso − 7 days, nowIso + 12 hours]`, are stamped with `nowIso`
 *   (live evidence: the LLM hallucinated a 2023 date).
 *
 * Non-object input is returned unchanged; the input object is never mutated.
 */
export function normalizeLogNutritionIncidentChanges(
  changes: unknown,
  ctx: NutritionIncidentNormalizationContext,
): unknown {
  if (changes === null || typeof changes !== "object" || Array.isArray(changes)) {
    return changes;
  }

  const source = changes as Record<string, unknown>;
  const imagesPresent = ctx.imageAttachmentIds.length > 0;
  const normalized: Record<string, unknown> = { ...source };

  if (imagesPresent) {
    // Trusted stamping: the turn's real attachment ids replace whatever the
    // LLM emitted (capped to the schema maximum).
    normalized["imageRefs"] = ctx.imageAttachmentIds
      .slice(0, MAX_IMAGE_REFS)
      .map((id) => ({ id }));
  } else {
    const coerced = coerceImageRefEntries(source["imageRefs"]);

    if (coerced !== undefined) {
      normalized["imageRefs"] = coerced;
    }
  }

  normalized["provenance"] = normalizeProvenance(source["provenance"], imagesPresent);
  normalized["incidentDateTime"] = normalizeIncidentDateTime(
    source["incidentDateTime"],
    ctx.nowIso,
  );

  return normalized;
}

function coerceImageRefEntries(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((entry) =>
    typeof entry === "string" && UUID_PATTERN.test(entry) ? { id: entry } : entry,
  );
}

function normalizeProvenance(value: unknown, imagesPresent: boolean): unknown {
  const fallbackSource = imagesPresent ? "vision_llm_estimate" : "text_estimate";

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { source: fallbackSource };
  }

  const provenance = value as Record<string, unknown>;
  const parsedSource = nutritionProvenanceLabelSchema.safeParse(provenance["source"]);

  if (!parsedSource.success) {
    return { ...provenance, source: fallbackSource };
  }

  if (
    imagesPresent &&
    (parsedSource.data === "food_photo_analysis" || parsedSource.data === "dev_stub")
  ) {
    // No FoodPhotoAnalysis records exist on the LLM multimodal path — the only
    // honest photo-backed provenance for an LLM-emitted proposal is
    // vision_llm_estimate.
    return { ...provenance, source: "vision_llm_estimate" };
  }

  return value;
}

function normalizeIncidentDateTime(value: unknown, nowIso: string): string {
  if (typeof value !== "string" || !isoDateTimeSchema.safeParse(value).success) {
    return nowIso;
  }

  const incidentMs = Date.parse(value);
  const nowMs = Date.parse(nowIso);

  if (Number.isNaN(incidentMs) || Number.isNaN(nowMs)) {
    return nowIso;
  }

  if (incidentMs < nowMs - PAST_WINDOW_MS || incidentMs > nowMs + FUTURE_WINDOW_MS) {
    return nowIso;
  }

  return value;
}
