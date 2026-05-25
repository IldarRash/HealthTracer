import type {
  CorrelationEvidenceRef,
  CorrelationInsightPreviewResponse,
  WellnessCorrelationInsight,
} from "@health/types";
import {
  buildHealthMetricAggregateEvidenceId,
  containsUnsafeWellnessInsightLanguage,
  isDocumentSignalCorrelationEligible,
  validateWellnessCorrelationInsight,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { ClerkAuthContext } from "../../auth.types.js";
import { MetricsAiContextService } from "../health-metrics/metrics-ai-context.service.js";
import { UsersService } from "../users/users.service.js";
import { toDocumentSignal } from "./document-signal.mapper.js";
import { toHealthDocument } from "./document.mapper.js";
import { DocumentSignalsRepository } from "./document-signals.repository.js";

const MAX_INSIGHTS = 3;

@Injectable()
export class CorrelationsService {
  constructor(
    private readonly documentSignalsRepository: DocumentSignalsRepository,
    private readonly metricsAiContextService: MetricsAiContextService,
    private readonly usersService: UsersService,
  ) {}

  async previewInsights(auth: ClerkAuthContext): Promise<CorrelationInsightPreviewResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const [signalRows, metricsSummary] = await Promise.all([
      this.documentSignalsRepository.listCorrelationCandidates(user.id),
      this.metricsAiContextService.buildSummaryForUser(user.id),
    ]);

    const eligibleSignals = signalRows
      .map(({ document, signal }) => ({
        document: toHealthDocument(document),
        signal: toDocumentSignal(signal),
      }))
      .filter(({ document, signal }) =>
        isDocumentSignalCorrelationEligible(
          {
            consentScopes: document.consentScopes,
            revokedAt: document.revokedAt,
            deletedAt: document.deletedAt,
            parseStatus: document.parseStatus,
            signalExtractionStatus: document.signalExtractionStatus,
          },
          signal,
        ),
      );

    if (eligibleSignals.length === 0) {
      return {
        insights: [],
        generatedAt: new Date().toISOString(),
        dataStatus: metricsSummary.items.length === 0 ? "insufficient" : "partial",
      };
    }

    const insights: WellnessCorrelationInsight[] = [];
    const sleepMetric = metricsSummary.items.find((item) => item.metricType === "sleep");
    const energySignal = eligibleSignals.find(({ signal }) => signal.signalKey === "energy_level");

    if (energySignal && sleepMetric) {
      const sleepEvidenceId = buildHealthMetricAggregateEvidenceId(sleepMetric);

      insights.push(
        buildInsight({
          idSeed: ["energy", "sleep", energySignal.signal.id, sleepEvidenceId],
          headline: "Energy notes appeared alongside recent sleep summaries",
          summary:
            "Self-reported energy from an approved lab document and recent sleep summaries changed together. Recovery and sleep routines may be worth revisiting.",
          coachingDomain: "habits",
          evidenceRefs: [
            {
              type: "document_signal",
              id: energySignal.signal.id,
              label: `${energySignal.signal.displayLabel} from uploaded document`,
            },
            {
              type: "health_metric_aggregate",
              id: sleepEvidenceId,
              label: "Recent sleep summary",
            },
          ],
          confidence: "low",
        }),
      );
    }

    const safeInsights = insights
      .filter(
        (insight) =>
          insightIncludesDocumentSignal(insight.evidenceRefs) &&
          validateWellnessCorrelationInsight(insight).length === 0 &&
          !containsUnsafeWellnessInsightLanguage(insight.headline) &&
          !containsUnsafeWellnessInsightLanguage(insight.summary),
      )
      .slice(0, MAX_INSIGHTS);

    const dataStatus =
      safeInsights.length === 0
        ? "partial"
        : "sufficient";

    return {
      insights: safeInsights,
      generatedAt: new Date().toISOString(),
      dataStatus,
    };
  }
}

function insightIncludesDocumentSignal(evidenceRefs: CorrelationEvidenceRef[]): boolean {
  return evidenceRefs.some((ref) => ref.type === "document_signal");
}

function buildInsight(input: {
  idSeed: string[];
  headline: string;
  summary: string;
  coachingDomain: WellnessCorrelationInsight["coachingDomain"];
  evidenceRefs: CorrelationEvidenceRef[];
  confidence: WellnessCorrelationInsight["confidence"];
}): WellnessCorrelationInsight {
  const hash = createHash("sha256").update(input.idSeed.join(":")).digest("hex").slice(0, 12);

  return {
    id: `insight-${hash}`,
    headline: input.headline,
    summary: input.summary,
    coachingDomain: input.coachingDomain,
    evidenceRefs: input.evidenceRefs,
    confidence: input.confidence,
  };
}
