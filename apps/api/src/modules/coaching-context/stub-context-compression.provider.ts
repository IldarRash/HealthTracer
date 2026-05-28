import type {
  ContextCompressionSourceRange,
  ContextCompressionSummary,
  ContextSlicePurpose,
  UserContextSlice,
} from "@health/types";
import { contextCompressionSummarySchema } from "@health/types";
import { Injectable } from "@nestjs/common";
import type {
  ContextCompressionInput,
  ContextCompressionProvider,
} from "./context-compression.provider.js";

const DOCUMENT_SOURCE_DOMAINS = new Set(["document", "document_summary", "rag"]);

@Injectable()
export class StubContextCompressionProvider implements ContextCompressionProvider {
  async compress(input: ContextCompressionInput): Promise<ContextCompressionSummary> {
    const { packet, request, budget } = input;
    const slices = [packet.slice, ...packet.supplementarySlices];
    const keyFindings: string[] = [];
    const risks: string[] = [];
    const focusAreas: string[] = [];
    const sourceRanges: ContextCompressionSourceRange[] = [];

    for (const slice of slices) {
      focusAreas.push(mapPurposeToFocusArea(slice.purpose));
      sourceRanges.push({
        domain: mapPurposeToDomain(slice.purpose),
        slicePurpose: slice.purpose,
      });

      appendSliceFindings(slice, keyFindings, risks);
    }

    if (keyFindings.length === 0) {
      keyFindings.push(
        `Compressed ${request.reviewKind.replaceAll("_", " ")} context from ${slices.length} bounded slice(s).`,
      );
    }

    if (focusAreas.length === 0) {
      focusAreas.push("Overall wellness progress");
    }

    const sourceRefs = packet.sourceRefs
      .filter(
        (ref) =>
          !DOCUMENT_SOURCE_DOMAINS.has(ref.domain.trim().toLowerCase()) || budget.allowDocuments,
      )
      .map((ref) => ({
        domain: ref.domain,
        label: ref.label,
        ...(ref.referenceId ? { referenceId: ref.referenceId } : {}),
      }));

    return contextCompressionSummarySchema.parse({
      reviewKind: request.reviewKind,
      keyFindings: dedupeStrings(keyFindings).slice(0, 15),
      risks: dedupeStrings(risks).slice(0, 10),
      focusAreas: dedupeStrings(focusAreas).slice(0, 10),
      sourceRanges: sourceRanges.slice(0, 20),
      sourceRefs: sourceRefs.slice(0, 20),
      dataQuality: keyFindings.length >= 3 ? "sufficient" : "partial",
      confidence: keyFindings.length >= 3 ? "medium" : "low",
    });
  }
}

function appendSliceFindings(
  slice: UserContextSlice,
  keyFindings: string[],
  risks: string[],
): void {
  if (slice.weeklyProgress?.trends?.length) {
    for (const trend of slice.weeklyProgress.trends.slice(0, 3)) {
      keyFindings.push(`${trend.domain}: ${trend.message}`);
    }
  }

  if (slice.weeklyProgress?.userMessage) {
    keyFindings.push(slice.weeklyProgress.userMessage.slice(0, 500));
  }

  if (slice.activeWorkoutPlan?.summary) {
    keyFindings.push(`Workout plan: ${slice.activeWorkoutPlan.summary.slice(0, 200)}`);
  }

  if (slice.activeNutritionPlan?.summary) {
    keyFindings.push(`Nutrition plan: ${slice.activeNutritionPlan.summary.slice(0, 200)}`);
  }

  if (slice.recentHabitAdherence) {
    const adherence = slice.recentHabitAdherence;
    keyFindings.push(
      `Habit adherence: ${adherence.completed}/${adherence.scheduled} completed in ${adherence.window}.`,
    );
  }

  if (slice.metricsSummary?.items.length) {
    keyFindings.push(`Metrics: ${slice.metricsSummary.items[0]!.summary.slice(0, 200)}`);
  }

  if (slice.wellbeingSummary) {
    const wellbeing = slice.wellbeingSummary;
    keyFindings.push(
      `Wellbeing: ${wellbeing.checkInCount} check-ins over ${wellbeing.windowDays} days (${wellbeing.dataSufficiency} data).`,
    );
  }

  if (slice.recoveryContext?.focusMessage) {
    keyFindings.push(`Recovery: ${slice.recoveryContext.focusMessage.slice(0, 200)}`);
  }

  if (slice.weeklyProgress?.dataStatus === "insufficient") {
    risks.push(`Insufficient ${slice.purpose} data for a full review.`);
  }

  if (slice.recommendationConstraints.length > 0) {
    risks.push(slice.recommendationConstraints[0]!.slice(0, 240));
  }
}

function mapPurposeToFocusArea(purpose: ContextSlicePurpose): string {
  switch (purpose) {
    case "workout_adaptation":
      return "Training consistency";
    case "nutrition_adaptation":
      return "Nutrition alignment";
    case "weekly_review":
      return "Weekly progress";
    case "longevity_overview":
      return "Long-term wellness";
    case "health_context":
      return "Health context";
    case "daily_checkin":
      return "Daily wellbeing";
    default:
      return "General coaching";
  }
}

function mapPurposeToDomain(purpose: ContextSlicePurpose): string {
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

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
