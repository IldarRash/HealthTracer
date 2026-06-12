import { z } from "zod";

// ---------------------------------------------------------------------------
// Proposal correlation evidence references
//
// These schemas are consumed by the proposal validation layer (apps/api
// proposal-validation.service.ts) to verify that an AI proposal's evidenceRefs
// point at real, owned, in-window data.
// ---------------------------------------------------------------------------

export const correlationEvidenceRefTypeSchema = z.enum([
  "biomarker_reading",
  "health_metric_aggregate",
  "weekly_progress_summary",
  "habit_adherence",
]);

export type CorrelationEvidenceRefType = z.infer<typeof correlationEvidenceRefTypeSchema>;

export const correlationEvidenceRefSchema = z.object({
  type: correlationEvidenceRefTypeSchema,
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(160),
});

export type CorrelationEvidenceRef = z.infer<typeof correlationEvidenceRefSchema>;

/**
 * Evidence ref types the proposal validator can verify against real, owned data.
 * `biomarker_reading` is verified against consent-eligible readings (manual, or
 * extracted from a lab report with active coach-chat consent).
 */
export const VERIFIABLE_CORRELATION_EVIDENCE_REF_TYPES = [
  "biomarker_reading",
  "health_metric_aggregate",
  "weekly_progress_summary",
] as const satisfies readonly CorrelationEvidenceRefType[];

export function buildHealthMetricAggregateEvidenceId(item: {
  metricType: string;
  periodStart: string;
  periodEnd: string;
}): string {
  return `${item.metricType}:${item.periodStart}:${item.periodEnd}`;
}

export function parseHealthMetricAggregateEvidenceId(
  id: string,
): { metricType: string; periodStart: string; periodEnd: string } | null {
  const parts = id.split(":");

  if (parts.length !== 3) {
    return null;
  }

  const [metricType, periodStart, periodEnd] = parts;

  if (!metricType || !periodStart || !periodEnd) {
    return null;
  }

  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!isoDatePattern.test(periodStart) || !isoDatePattern.test(periodEnd)) {
    return null;
  }

  return { metricType, periodStart, periodEnd };
}

export const proposalCorrelationEvidenceRefsSchema = z
  .array(correlationEvidenceRefSchema)
  .max(5)
  .default([]);
