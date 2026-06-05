import type {
  ContextCompressionSourceRange,
  ContextCompressionSummary,
  ContextSlicePurpose,
  UserContextSlice,
} from "@health/types";
import { contextCompressionSummarySchema } from "@health/types";
import type { OpenAiCoachProviderOptions } from "../ai/openai-coach-provider.js";
import type {
  ContextCompressionInput,
  ContextCompressionProvider,
} from "./context-compression.provider.js";

/**
 * S5 safety: document source domains that must be stripped from sourceRefs when
 * budget.allowDocuments is false. Mirrors the guard in the deleted stub.
 */
const DOCUMENT_SOURCE_DOMAINS = new Set(["document", "document_summary", "rag"]);

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

/**
 * Real OpenAI-backed context compression provider.
 *
 * Builds a prompt exclusively from already-bounded packet fields (the same
 * fields the deleted stub's appendSliceFindings read) and re-applies both the
 * budget.allowDocuments and budget.allowSensitiveHealthContext floors (S5)
 * before sending anything to OpenAI. The output is
 * parsed with contextCompressionSummarySchema; any parse/fetch failure THROWS
 * so the caller (ContextCompressionService) degrades to summary:null (S2).
 */
export class OpenAiContextCompressionProvider implements ContextCompressionProvider {
  constructor(private readonly options: OpenAiCoachProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new Error(
        "OpenAiContextCompressionProvider requires OPENAI_API_KEY, but it is not configured.",
      );
    }
  }

  async compress(input: ContextCompressionInput): Promise<ContextCompressionSummary> {
    const { packet, request, budget } = input;

    // S5: strip document slices when not allowed before building the prompt.
    // The prompt is built exclusively from already-bounded, non-document packet fields.
    const slices = [packet.slice, ...packet.supplementarySlices];
    const filteredSourceRefs = packet.sourceRefs.filter(
      (ref) =>
        !DOCUMENT_SOURCE_DOMAINS.has(ref.domain.trim().toLowerCase()) || budget.allowDocuments,
    );

    const systemPrompt = buildCompressionSystemPrompt(request.reviewKind, request.lookbackDays);
    const userContent = buildCompressionUserContent(
      slices,
      filteredSourceRefs,
      budget.allowSensitiveHealthContext,
    );

    const payload = await this.requestJsonCompletion(systemPrompt, userContent);

    // Parse output strictly; any schema violation throws so caller degrades to null (S2).
    return contextCompressionSummarySchema.parse(payload);
  }

  private async requestJsonCompletion(systemPrompt: string, userContent: string): Promise<unknown> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    const parsed = (await response.json()) as OpenAiChatCompletionResponse;

    if (!response.ok) {
      throw new Error(
        parsed.error?.message ??
          `OpenAI context compression request failed with status ${response.status}.`,
      );
    }

    const content = parsed.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("OpenAI context compression provider returned an empty response.");
    }

    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new Error("OpenAI context compression provider returned non-JSON content.");
    }
  }
}

// ---------------------------------------------------------------------------
// Prompt builders — use only bounded, already-filtered slice fields (S5)
// ---------------------------------------------------------------------------

function buildCompressionSystemPrompt(reviewKind: string, lookbackDays: number): string {
  return `You are a health coaching assistant compressing context for a ${reviewKind.replaceAll("_", " ")} turn covering the last ${String(lookbackDays)} days.

Respond with a JSON object matching this schema exactly:
{
  "reviewKind": "${reviewKind}",
  "keyFindings": ["string (1-500 chars)", ...],   // 1–15 items, required
  "risks": ["string (1-500 chars)", ...],          // 0–10 items
  "focusAreas": ["string (1-240 chars)", ...],     // 1–10 items, required
  "sourceRanges": [{ "domain": "string", "slicePurpose": "string" }, ...],  // 0–20 items
  "sourceRefs": [{ "domain": "string", "label": "string" }, ...],           // 0–20 items
  "dataQuality": "sufficient" | "partial",         // optional
  "confidence": "high" | "medium" | "low"          // optional
}

Rules:
- keyFindings and focusAreas are required arrays with at least 1 item each.
- Do NOT include raw document text, snippets, summaries, or health_document content.
- Do NOT add any fields beyond the schema above.
- Be concise; each item is a short factual observation.`;
}

function buildCompressionUserContent(
  slices: readonly UserContextSlice[],
  filteredSourceRefs: ReadonlyArray<{ domain: string; label: string; referenceId?: string }>,
  allowSensitiveHealth: boolean,
): string {
  const findings: string[] = [];
  const risks: string[] = [];
  const focusAreas: string[] = [];
  const sourceRanges: ContextCompressionSourceRange[] = [];

  for (const slice of slices) {
    const domain = mapPurposeToDomain(slice.purpose);
    focusAreas.push(mapPurposeToFocusArea(slice.purpose));
    sourceRanges.push({ domain, slicePurpose: slice.purpose });

    // Only read non-document, already-bounded fields from the slice (S5).
    appendBoundedSliceFindings(slice, findings, risks, allowSensitiveHealth);
  }

  const content = {
    sliceSummaries: findings.slice(0, 20),
    risks: risks.slice(0, 10),
    focusAreas: [...new Set(focusAreas)].slice(0, 10),
    sourceRanges: sourceRanges.slice(0, 20),
    sourceRefs: filteredSourceRefs.slice(0, 20).map((ref) => ({
      domain: ref.domain,
      label: ref.label,
      ...(ref.referenceId ? { referenceId: ref.referenceId } : {}),
    })),
  };

  return `Health context for compression:\n${JSON.stringify(content, null, 2)}`;
}

/**
 * Reads only the non-document, already-bounded fields from a slice.
 * Deliberately does NOT read documentContext or ragResults (S5).
 */
function appendBoundedSliceFindings(
  slice: UserContextSlice,
  findings: string[],
  risks: string[],
  allowSensitiveHealth: boolean,
): void {
  if (slice.weeklyProgress?.trends?.length) {
    for (const trend of slice.weeklyProgress.trends.slice(0, 3)) {
      findings.push(`${trend.domain}: ${trend.message}`);
    }
  }

  if (slice.weeklyProgress?.userMessage) {
    findings.push(slice.weeklyProgress.userMessage.slice(0, 500));
  }

  if (slice.activeWorkoutPlan?.summary) {
    findings.push(`Workout plan: ${slice.activeWorkoutPlan.summary.slice(0, 200)}`);
  }

  if (slice.activeNutritionPlan?.summary) {
    findings.push(`Nutrition plan: ${slice.activeNutritionPlan.summary.slice(0, 200)}`);
  }

  if (slice.recentHabitAdherence) {
    const adherence = slice.recentHabitAdherence;
    findings.push(
      `Habit adherence: ${String(adherence.completed)}/${String(adherence.scheduled)} completed in ${adherence.window}.`,
    );
  }

  if (slice.metricsSummary?.items.length) {
    findings.push(`Metrics: ${slice.metricsSummary.items[0]!.summary.slice(0, 200)}`);
  }

  // S5: wellbeingSummary and recoveryContext are sensitive-health context — only
  // read them when the budget allows it (the same fields applyBudgetToBuiltSlice
  // nulls out when allowSensitiveHealthContext is false).
  if (allowSensitiveHealth && slice.wellbeingSummary) {
    const wellbeing = slice.wellbeingSummary;
    findings.push(
      `Wellbeing: ${String(wellbeing.checkInCount)} check-ins over ${String(wellbeing.windowDays)} days (${wellbeing.dataSufficiency} data).`,
    );
  }

  if (allowSensitiveHealth && slice.recoveryContext?.focusMessage) {
    findings.push(`Recovery: ${slice.recoveryContext.focusMessage.slice(0, 200)}`);
  }

  if (slice.weeklyProgress?.dataStatus === "insufficient") {
    risks.push(`Insufficient ${slice.purpose} data for a full review.`);
  }

  if (slice.recommendationConstraints.length > 0) {
    risks.push(slice.recommendationConstraints[0]!.slice(0, 240));
  }

  // S5: documentContext and ragResults are intentionally NOT read here.
  // We never echo raw document text; document sourceRefs are stripped upstream
  // when budget.allowDocuments is false.
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
