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
import { createContextCompressionProvider } from "./context-compression.factory.js";
import type { ContextCompressionProvider } from "./context-compression.provider.js";
import {
  CONTEXT_COMPRESSION_FALLBACK_PROVIDER,
  CONTEXT_COMPRESSION_PROVIDER,
} from "./context-compression.tokens.js";
import { StubContextCompressionProvider } from "./stub-context-compression.provider.js";

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
  private readonly provider: ContextCompressionProvider;
  private readonly fallbackProvider: ContextCompressionProvider;

  constructor(
    @Optional()
    @Inject(CONTEXT_COMPRESSION_PROVIDER)
    provider?: ContextCompressionProvider,
    @Optional()
    @Inject(CONTEXT_COMPRESSION_FALLBACK_PROVIDER)
    fallbackProvider?: ContextCompressionProvider,
  ) {
    this.provider = provider ?? createContextCompressionProvider();
    this.fallbackProvider = fallbackProvider ?? new StubContextCompressionProvider();
  }

  async compressForTurn(input: CompressForTurnInput): Promise<CompressForTurnResult> {
    if (!input.budget.requiresCompression) {
      return { summary: null, notes: [] };
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

      notes.push("Compression provider returned invalid output; using deterministic fallback.");
    } catch {
      notes.push("Compression provider failed; using deterministic fallback.");
    }

    return this.applyFallbackCompression(input, request, notes);
  }

  private async applyFallbackCompression(
    input: CompressForTurnInput,
    request: ContextCompressionRequest,
    notes: string[],
  ): Promise<CompressForTurnResult> {
    try {
      const raw = await this.fallbackProvider.compress({
        packet: input.packet,
        request,
        budget: input.budget,
      });
      const parsed = safeParseContextCompressionSummary(raw);

      if (parsed.success) {
        return { summary: parsed.data, notes };
      }
    } catch {
      // Fall through to null summary.
    }

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
    includeDocuments: input.budget.allowDocuments,
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
