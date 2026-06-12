/**
 * llm-emission/wellbeing.ts — capture_wellbeing_checkin LLM emission schema.
 *
 * Strict-mode compatible BY CONSTRUCTION — see llm-emission/index.ts.
 *
 * safetyFlags is intentionally OMITTED: crisis flag reasons must never be
 * LLM-settable through chat proposals (getWellbeingCheckinProposalDomainErrors
 * rejects `keyword_match` arriving via a proposal payload).
 */

import { z } from "zod";

export const captureWellbeingCheckinLlmEmissionSchema = z
  .object({
    /** ISO date (YYYY-MM-DD); canonical isoDateSchema validates downstream. */
    date: z.string(),
    /** 1–5 integer scores; canonical wellbeingScoreSchema validates downstream. */
    moodScore: z.number(),
    stressScore: z.number(),
    energyLevel: z.number().nullable(),
    note: z.string().nullable(),
    tags: z.array(z.string()),
  })
  .strict();
