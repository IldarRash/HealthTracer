import { z } from "zod";
import { biomarkerKeySchema } from "./biomarkers.js";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";
import { biomarkerReadingSourceSchema } from "./lab-reports.js";

// ---------------------------------------------------------------------------
// Coach-chat biomarker context summary.
//
// The ONLY biomarker shape that may enter the chat/LLM context. It carries
// structured, catalog-labeled data exclusively — deliberately NO reference
// ranges (they invite range-interpretation/diagnosis language from the model)
// and NO document-derived free text. Eligibility is consent-gated at the data
// layer: manual readings are always eligible (the user typed them
// deliberately); extracted readings require the owning lab report's per-report
// coach-chat consent (`coachContextConsentAt`).
//
// Unlike the legacy documentContext, this summary is exempt from the
// `allowDocuments` context-budget floor by design: it is user-visible,
// user-editable, consent-gated structured state — not raw document text.
// ---------------------------------------------------------------------------

export const MAX_BIOMARKER_CONTEXT_ITEMS = 30;

export const biomarkerContextItemSchema = z
  .object({
    biomarkerKey: biomarkerKeySchema,
    displayLabel: z.string().min(1).max(120),
    value: z.number().nullable(),
    valueText: z.string().min(1).max(40).nullable(),
    unit: z.string().min(1).max(40),
    observedAt: isoDateSchema.nullable(),
    source: biomarkerReadingSourceSchema,
  })
  // strict: structurally forbids reference ranges / free-text extras.
  .strict();

export type BiomarkerContextItem = z.infer<typeof biomarkerContextItemSchema>;

export const aiBiomarkerContextSummarySchema = z
  .object({
    items: z.array(biomarkerContextItemSchema).max(MAX_BIOMARKER_CONTEXT_ITEMS),
    generatedAt: isoDateTimeSchema,
  })
  .strict();

export type AiBiomarkerContextSummary = z.infer<typeof aiBiomarkerContextSummarySchema>;
