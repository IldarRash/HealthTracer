import type {
  AgentContextPacket,
  ContextBudgetPolicy,
  ContextCompressionRequest,
  ContextCompressionReviewKind,
  ContextCompressionSummary,
  ContextSlicePurpose,
} from "@health/types";
import {
  contextCompressionRequestSchema,
  safeParseContextCompressionSummary,
} from "@health/types";
import { Inject, Injectable, Optional } from "@nestjs/common";
import type { ContextPlanReviewSignals } from "./context-budget-policy.service.js";
import type { ContextCompressionProvider } from "./context-compression.provider.js";
import { CONTEXT_COMPRESSION_PROVIDER } from "./context-compression.tokens.js";

export interface CompressForTurnInput {
  packet: AgentContextPacket;
  reviewSignals: Pick<
    ContextPlanReviewSignals,
    "isMonthlyReview" | "isMultiDomainReview" | "isProgressReview"
  >;
  budget: ContextBudgetPolicy;
}

export interface CompressForTurnResult {
  summary: ContextCompressionSummary | null;
  notes: string[];
}

@Injectable()
export class ContextCompressionService {
  private readonly provider: ContextCompressionProvider | undefined;

  constructor(
    @Optional()
    @Inject(CONTEXT_COMPRESSION_PROVIDER)
    provider?: ContextCompressionProvider,
  ) {
    this.provider = provider;
  }

  async compressForTurn(input: CompressForTurnInput): Promise<CompressForTurnResult> {
    if (!input.budget.requiresCompression) {
      return { summary: null, notes: [] };
    }

    // S2: when no provider is configured (e.g. test env without an API key),
    // degrade gracefully to null rather than throwing.
    if (!this.provider) {
      return { summary: null, notes: ["No compression provider configured; skipping compression."] };
    }

    const request = buildContextCompressionRequest(input);
    const notes: string[] = [];

    try {
      const raw = await this.provider.compress({
        packet: input.packet,
        request,
        budget: input.budget,
      });
      const parsed = safeParseContextCompressionSummary(raw);

      if (parsed.success) {
        notes.push("Context compressed into typed summary for large review turn.");
        return { summary: parsed.data, notes };
      }

      notes.push("Compression provider returned invalid output; skipping compression.");
    } catch {
      notes.push("Compression provider failed; skipping compression.");
    }

    // S2: single-provider failure degrades to null — no second LLM call.
    return {
      summary: null,
      notes: [...notes, "Unable to produce typed compression summary."],
    };
  }
}

export function buildContextCompressionRequest(
  input: CompressForTurnInput,
): ContextCompressionRequest {
  const slices = [input.packet.slice, ...input.packet.supplementarySlices];
  const slicePurposes = dedupeSlicePurposes(slices.map((slice) => slice.purpose));

  return contextCompressionRequestSchema.parse({
    reviewKind: resolveReviewKind(input.reviewSignals),
    slicePurposes,
    lookbackDays: input.budget.maxLookbackDays,
    domainBuckets: slicePurposes.map(mapPurposeToDomainBucket),
  });
}

export function resolveReviewKind(
  signals: Pick<
    ContextPlanReviewSignals,
    "isMonthlyReview" | "isMultiDomainReview" | "isProgressReview"
  >,
): ContextCompressionReviewKind {
  if (signals.isMonthlyReview) {
    return "monthly_review";
  }

  return "multi_domain_review";
}

function dedupeSlicePurposes(purposes: readonly ContextSlicePurpose[]): ContextSlicePurpose[] {
  return [...new Set(purposes)];
}

function mapPurposeToDomainBucket(purpose: ContextSlicePurpose): string {
  switch (purpose) {
    case "workout_adaptation":
      return "workout";
    case "nutrition_adaptation":
      return "nutrition";
    case "weekly_review":
    case "progress_history_review":
      return "progress";
    case "longevity_overview":
      return "longevity";
    case "health_context":
      return "health";
    case "daily_checkin":
      return "wellbeing";
    default:
      return "general";
  }
}
