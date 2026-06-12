import { z } from "zod";
import { isoDateSchema } from "./dates.js";
import { biomarkerKeySchema } from "./biomarkers.js";

// ---------------------------------------------------------------------------
// Lab-extraction LLM output contract.
//
// This is the wire schema the dedicated lab-extraction provider returns (it is
// SEPARATE from the chat fan-out / CoachAiProvider). The biomarkerKey field is
// a closed enum over the catalog: markers the LLM cannot map onto a known key
// are counted in `unmappedMarkerCount` only — their free-text labels are never
// returned or persisted (fail-closed).
// ---------------------------------------------------------------------------

export const extractedReadingSchema = z
  .object({
    biomarkerKey: biomarkerKeySchema,
    valueNumeric: z.number().finite().nullable(),
    valueText: z.string().min(1).max(40).nullable(),
    unit: z.string().min(1).max(40),
    referenceRangeText: z.string().min(1).max(120).nullable(),
    observedAt: isoDateSchema.nullable(),
    confidence: z.number().min(0).max(1),
  })
  .superRefine((reading, ctx) => {
    const hasNumeric = reading.valueNumeric !== null;
    const hasText = reading.valueText !== null;

    if (hasNumeric === hasText) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of valueNumeric or valueText.",
        path: ["valueNumeric"],
      });
    }
  });

export type ExtractedReading = z.infer<typeof extractedReadingSchema>;
export type ExtractedReadingInput = z.input<typeof extractedReadingSchema>;

export const labExtractionOutputSchema = z.object({
  isLabReport: z.boolean(),
  observedAt: isoDateSchema.nullable(),
  readings: z.array(extractedReadingSchema).max(80),
  unmappedMarkerCount: z.number().int().min(0).max(500),
});

export type LabExtractionOutput = z.infer<typeof labExtractionOutputSchema>;
export type LabExtractionOutputInput = z.input<typeof labExtractionOutputSchema>;
