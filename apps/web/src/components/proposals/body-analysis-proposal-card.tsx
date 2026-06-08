"use client";

/**
 * BodyAnalysisProposalCard — inline proposal card for the `save_body_analysis` intent.
 *
 * Wraps the shared `BodyAnalysisCard` atom inside `ProposalCardShell` so the
 * accept/modify/reject lifecycle is identical to other domain cards.
 *
 * Safety floors (enforced here):
 * 1. Wellness-not-medical: BodyAnalysisCard always renders its visual-estimate
 *    disclaimer. This card never overrides or omits it.
 * 2. Numbers-only: the payload contains estimates (fat%, muscleTone, etc.) only.
 *    No image bytes, no attachment refs, no camera data accepted or rendered.
 * 3. Proposal-only saves: the accept action goes through useInlineProposalActions;
 *    no direct DB writes from the frontend.
 */

import type { AiProposal, ProposalModifyResponse } from "@health/types";
import { saveBodyAnalysisProposalPayloadSchema } from "@health/types";
import type { ReactNode } from "react";
import { useMemo } from "react";
import Link from "next/link";
import { useInlineProposalActions } from "../../lib/use-inline-proposal-actions";
import {
  canAcceptProposal,
  getProposalNavigationRoute,
} from "../../lib/proposal-ui-state";
import {
  BodyAnalysisCard,
  type BodyAnalysisMetric,
  type BodyAnalysisZone,
} from "../ui/body-analysis-card";
import { ProposalCardShell } from "./proposal-card-shell";

// ── Payload parsing ───────────────────────────────────────────────

function parsePayload(proposedChanges: unknown) {
  const parsed = saveBodyAnalysisProposalPayloadSchema.safeParse(proposedChanges);
  return parsed.success ? parsed.data : null;
}

// ── Metric derivation ────────────────────────────────────────────

const MUSCLE_TONE_LABELS: Record<string, string> = {
  above_average: "Выше среднего",
  average: "Средний",
  below_average: "Ниже среднего",
};

function buildMetrics(
  payload: ReturnType<typeof parsePayload>,
): BodyAnalysisMetric[] {
  if (!payload) return [];
  const metrics: BodyAnalysisMetric[] = [];

  // Fat % range
  const hasFat = payload.fatPctMin != null || payload.fatPctMax != null;
  if (hasFat) {
    const min = payload.fatPctMin;
    const max = payload.fatPctMax;
    const value =
      min != null && max != null
        ? `≈ ${min}–${max}`
        : min != null
          ? `≥ ${min}`
          : max != null
            ? `≤ ${max}`
            : "—";
    metrics.push({ value, unit: "%", label: "Жир", tone: "amber" });
  }

  // Muscle tone
  if (payload.muscleTone != null) {
    metrics.push({
      value: MUSCLE_TONE_LABELS[payload.muscleTone] ?? payload.muscleTone,
      label: "Мыш. тонус",
      tone: "green",
    });
  }

  // Weight (self-reported)
  if (payload.weightKg != null) {
    metrics.push({
      value: `${payload.weightKg}`,
      unit: "кг",
      label: "Вес*",
      tone: "ink",
    });
  }

  return metrics;
}

function buildZones(
  payload: ReturnType<typeof parsePayload>,
): BodyAnalysisZone[] {
  if (!payload) return [];
  const zones: BodyAnalysisZone[] = [];

  if (payload.strongGroups.length > 0) {
    zones.push({ kind: "strong", text: payload.strongGroups.join(", ") });
  }

  if (payload.weakGroups.length > 0) {
    zones.push({ kind: "growth", text: payload.weakGroups.join(", ") });
  }

  return zones;
}

// ── Success node ─────────────────────────────────────────────────

function buildAcceptedSuccessNode(domainRoute: string | null): ReactNode {
  return (
    <>
      Сохранено в профиль · «Анализ тела»
      {domainRoute ? (
        <>
          {" "}
          <Link href={domainRoute} className="confirmation-card__link">
            Открыть →
          </Link>
        </>
      ) : null}
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────

type BodyAnalysisProposalCardProps = {
  proposal: AiProposal;
  onDecision?: (proposal: AiProposal) => void;
  onModifyRequest?: (response: ProposalModifyResponse) => void;
};

export function BodyAnalysisProposalCard({
  proposal,
  onDecision,
  onModifyRequest,
}: BodyAnalysisProposalCardProps) {
  const payload = useMemo(
    () => parsePayload(proposal.proposedChanges),
    [proposal.proposedChanges],
  );

  const hookValues = useInlineProposalActions({ proposal, onDecision, onModifyRequest });

  const isPending = proposal.status === "pending";
  const canAccept = canAcceptProposal(proposal);
  const domainRoute = getProposalNavigationRoute(proposal);

  const metrics = useMemo(() => buildMetrics(payload), [payload]);
  const zones = useMemo(() => buildZones(payload), [payload]);

  const acceptedSuccessNode = useMemo(
    () => buildAcceptedSuccessNode(domainRoute),
    [domainRoute],
  );

  if (!payload) {
    // Fallback: if we can't parse the payload, show a minimal card.
    return (
      <ProposalCardShell
        {...hookValues}
        proposal={proposal}
        acceptLabel="Сохранить в профиль"
        canAccept={false}
        acceptDisabledTitle="Данные анализа недоступны."
        viewOnLinkLabel="Открыть профиль →"
        modifyFormLabel="Что хотите изменить?"
        modifyFormPlaceholder="Например: уточнить процент жира."
        acceptedSuccessNode={acceptedSuccessNode}
      >
        <p className="proposal-meta">
          Данные анализа не удалось загрузить. Попробуйте обновить страницу.
        </p>
      </ProposalCardShell>
    );
  }

  return (
    <ProposalCardShell
      {...hookValues}
      proposal={proposal}
      acceptLabel="Сохранить в профиль"
      canAccept={isPending && canAccept}
      viewOnLinkLabel="Открыть профиль →"
      modifyFormLabel="Что хотите уточнить в анализе?"
      modifyFormPlaceholder="Например: уточнить процент жира или пересмотреть зоны роста."
      acceptedSuccessNode={acceptedSuccessNode}
    >
      {isPending ? (
        <BodyAnalysisCard
          metrics={metrics}
          zones={zones}
          className="body-analysis-proposal-card__result"
        />
      ) : null}
    </ProposalCardShell>
  );
}
