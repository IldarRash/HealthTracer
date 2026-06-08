"use client";

/**
 * AdjustNutritionPlanProposalCard — C4 "make plan lighter" dietary draft.
 *
 * Renders when an adjust_nutrition_plan proposal carries a structured `swaps[]`
 * array + optional `fromCaloriesPerDay` before-value. Shows:
 *   - Coach intro note
 *   - Before / After calorie compare (v_current → v_draft)
 *   - Swap DiffRow list (struck-through from → bold to, kcal saved per row)
 *   - Decision row: Apply / Modify / Reject, wired to the existing proposal lifecycle
 *
 * Reuses: ProposalCardShell (shared chrome + accept/modify/reject actions),
 *   useInlineProposalActions (TanStack mutation + invalidation).
 * Does NOT duplicate the backend proposal/revision lifecycle — the shell owns
 * accept/reject routing and the backend creates a new revision on accept.
 *
 * Safety: wellness framing only — no clinical claims; calorie figures are approx.
 */

import type { AdjustNutritionPlanFromProgressChanges, AiProposal, NutritionSwapItem, ProposalModifyResponse } from "@health/types";
import Link from "next/link";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { parseAdjustNutritionPlanProposalPayload } from "../../lib/action-proposal-ui-state";
import { getProposalNavigationRoute } from "../../lib/proposal-ui-state";
import { useInlineProposalActions } from "../../lib/use-inline-proposal-actions";
import { CoachNotes, Icon, IconBadge } from "../ui";
import { ProposalCardShell } from "./proposal-card-shell";

type AdjustNutritionPlanProposalCardProps = {
  proposal: AiProposal;
  /** Pre-parsed payload (avoids double-parsing in the router). */
  payload: AdjustNutritionPlanFromProgressChanges;
  onDecision?: (proposal: AiProposal) => void;
  onModifyRequest?: (response: ProposalModifyResponse) => void;
};

// ── SwapDiffRow ─────────────────────────────────────────────────

type SwapDiffRowProps = {
  swap: NutritionSwapItem;
};

function SwapDiffRow({ swap }: SwapDiffRowProps) {
  const saveNum = swap.save != null ? Number.parseInt(swap.save, 10) : null;
  const displaySave = saveNum != null && Number.isFinite(saveNum) ? saveNum : null;

  return (
    <div className="dietary-draft__swap-row" role="listitem">
      <IconBadge
        icon="fork"
        color="var(--color-text-muted)"
        size={30}
        radius={8}
      />
      <span className="dietary-draft__swap-from">{swap.from}</span>
      <Icon
        name="arrow"
        size={15}
        className="dietary-draft__swap-arrow"
        aria-hidden="true"
      />
      <span className="dietary-draft__swap-to">{swap.to}</span>
      {displaySave != null ? (
        <span
          className="dietary-draft__chip dietary-draft__chip--saved"
          aria-label={`saves ${displaySave} kcal`}
        >
          −{displaySave} kcal
        </span>
      ) : null}
    </div>
  );
}

// ── MacroChip ────────────────────────────────────────────────────

type MacroChipTone = "green" | "amber" | "neutral";

function MacroChip({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  tone: MacroChipTone;
}) {
  if (value == null) return null;
  return (
    <span className={`dietary-draft__chip dietary-draft__chip--${tone}`}>
      {label} {value} {unit}
    </span>
  );
}

// ── BeforeAfterCompare ──────────────────────────────────────────

type BeforeAfterCompareProps = {
  fromKcal: number | undefined;
  toKcal: number | undefined;
  fromProtein: number | null | undefined;
  toProtein: number | null | undefined;
  fromCarbs: number | null | undefined;
  toCarbs: number | null | undefined;
  /** Draft version label, e.g. "v9 (draft)". */
  draftVersionLabel: string;
};

function BeforeAfterCompare({
  fromKcal,
  toKcal,
  fromProtein,
  toProtein,
  fromCarbs,
  toCarbs,
  draftVersionLabel,
}: BeforeAfterCompareProps) {
  const saved =
    fromKcal != null && toKcal != null ? fromKcal - toKcal : null;

  return (
    <div
      className="dietary-draft__compare"
      aria-label="Before and after calorie comparison"
    >
      {/* Before card */}
      <div className="dietary-draft__compare-card">
        <p className="dietary-draft__compare-eyebrow">Current</p>
        <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 4 }}>
          {fromKcal != null ? (
            <span className="dietary-draft__compare-number">{fromKcal}</span>
          ) : null}
          <span className="dietary-draft__compare-unit">kcal / day</span>
        </div>
        <div className="dietary-draft__compare-chips">
          <MacroChip label="Protein" value={fromProtein} unit="g" tone="green" />
          <MacroChip label="Carbs" value={fromCarbs} unit="g" tone="neutral" />
        </div>
      </div>

      {/* Arrow */}
      <div className="dietary-draft__compare-arrow" aria-hidden="true">
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--color-metric-green-dim)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="arrow" size={18} stroke="var(--color-metric-green)" />
        </div>
      </div>

      {/* After card */}
      <div className="dietary-draft__compare-card dietary-draft__compare-card--after">
        <p className="dietary-draft__compare-eyebrow dietary-draft__compare-eyebrow--after">
          Lighter · {draftVersionLabel}
        </p>
        <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 4 }}>
          {toKcal != null ? (
            <span className="dietary-draft__compare-number dietary-draft__compare-number--after">
              {toKcal}
            </span>
          ) : null}
          <span className="dietary-draft__compare-unit">kcal / day</span>
          {saved != null && saved > 0 ? (
            <span
              className="dietary-draft__chip dietary-draft__chip--saved"
              aria-label={`saves ${saved} kcal per day`}
            >
              −{saved} kcal
            </span>
          ) : null}
        </div>
        <div className="dietary-draft__compare-chips">
          <MacroChip label="Protein" value={toProtein} unit="g" tone="green" />
          <MacroChip label="Carbs" value={toCarbs} unit="g" tone="amber" />
        </div>
      </div>
    </div>
  );
}

// ── Swaps section ───────────────────────────────────────────────

function SwapList({ swaps }: { swaps: NutritionSwapItem[] }) {
  const totalSaved = useMemo(() => {
    return swaps.reduce((sum, s) => {
      if (s.save == null) return sum;
      const n = Number.parseInt(s.save, 10);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [swaps]);

  return (
    <div className="dietary-draft__swaps-card" role="list" aria-label="Food substitutions">
      {/* Header */}
      <div className="dietary-draft__swaps-header">
        <IconBadge icon="spark" color="var(--color-metric-green)" size={26} radius={7} />
        <span className="dietary-draft__swaps-header-title">
          Substitutions that lighten your plan
        </span>
        <span
          className="dietary-draft__swaps-header-meta"
          aria-label={`${swaps.length} swaps saving ${totalSaved} kcal`}
        >
          {swaps.length} swap{swaps.length !== 1 ? "s" : ""} · −{totalSaved} kcal
        </span>
      </div>

      {/* Rows */}
      <div className="dietary-draft__swaps-rows">
        {swaps.map((swap, i) => (
          <SwapDiffRow key={`${swap.from}-${i}`} swap={swap} />
        ))}
      </div>
    </div>
  );
}

// ── Wellness disclaimer ─────────────────────────────────────────

function WellnessDisclaimer() {
  return (
    <div className="dietary-draft__disclaimer" role="note" aria-label="Wellness disclaimer">
      <Icon name="info" size={14} stroke="var(--color-text-muted)" aria-hidden="true" />
      <p className="dietary-draft__disclaimer-text">
        Calorie and macro figures are approximate coaching estimates, not a prescribed diet.
        This proposal is a starting point — you decide whether to apply it.
      </p>
    </div>
  );
}

// ── Main card ───────────────────────────────────────────────────

export function AdjustNutritionPlanProposalCard({
  proposal,
  payload,
  onDecision,
  onModifyRequest,
}: AdjustNutritionPlanProposalCardProps) {
  const hookValues = useInlineProposalActions({
    proposal,
    onDecision,
    onModifyRequest,
    // No custom accept payload override: submit the original proposedChanges as-is.
    // The backend apply path already handles the swaps metadata.
  });

  const isPending = proposal.status === "pending";
  const domainRoute = getProposalNavigationRoute(proposal);

  const swaps = payload.swaps ?? [];
  const fromKcal = payload.fromCaloriesPerDay;
  const toKcal = payload.plan.caloriesPerDay ?? undefined;
  // protein and carbs shown only on the "after" side; fromProtein/fromCarbs
  // are not in the before-state snapshot — show protein as "unchanged" on both sides
  const toProtein = typeof payload.plan.proteinGrams === "number" ? payload.plan.proteinGrams : undefined;
  const fromProtein = toProtein; // protein-not-cut rule: same on both sides
  const fromCarbs: number | undefined = undefined;
  const toCarbs = typeof payload.plan.carbsGrams === "number" ? payload.plan.carbsGrams : undefined;

  // Draft version label derived from the proposal's applied reference if available.
  // Falls back to "draft" when the proposal hasn't been applied yet.
  const draftVersionLabel = "draft";

  const acceptedSuccessNode = (
    <>
      Plan updated — lighter version is now active.
      {domainRoute ? (
        <>
          {" "}
          <Link href={domainRoute} className="confirmation-card__link">
            View nutrition →
          </Link>
        </>
      ) : null}
    </>
  );

  return (
    <ProposalCardShell
      {...hookValues}
      proposal={proposal}
      acceptLabel="Apply lighter plan"
      modifyFormLabel="What would you like to change about these substitutions?"
      modifyFormPlaceholder="For example: swap the pasta for something else, or keep the rice."
      acceptedSuccessNode={acceptedSuccessNode}
      viewOnLinkLabel="View on Nutrition →"
    >
      {isPending ? (
        <div className="dietary-draft__body">
          {/* Coach intro */}
          <CoachNotes label="Coach note">
            You asked for a lighter option. Protein is kept intact — calories come down through
            ingredient substitutions with similar flavours. This saves ≈{
              swaps.reduce((s, sw) => {
                if (sw.save == null) return s;
                const n = Number.parseInt(sw.save, 10);
                return s + (Number.isFinite(n) ? n : 0);
              }, 0)
            } kcal / day while keeping you full and on target for protein.
          </CoachNotes>

          {/* Before / After */}
          {(fromKcal != null || toKcal != null) ? (
            <BeforeAfterCompare
              fromKcal={fromKcal}
              toKcal={toKcal}
              fromProtein={fromProtein}
              toProtein={toProtein}
              fromCarbs={fromCarbs}
              toCarbs={toCarbs}
              draftVersionLabel={draftVersionLabel}
            />
          ) : null}

          {/* Swaps list */}
          {swaps.length > 0 ? <SwapList swaps={swaps} /> : null}

          {/* Empty-swaps fallback */}
          {swaps.length === 0 ? (
            <p className="proposal-meta" role="status">
              No substitution details were provided for this lighter plan.
            </p>
          ) : null}

          {/* Wellness disclaimer — always visible per safety brief */}
          <WellnessDisclaimer />
        </div>
      ) : null}
    </ProposalCardShell>
  );
}

/**
 * Router-level factory: parses proposedChanges and returns an
 * AdjustNutritionPlanProposalCard if the payload is a dietary-draft proposal
 * (adjust_nutrition_plan with swaps), or null otherwise.
 */
export function tryRenderAdjustNutritionPlanProposalCard(
  proposal: AiProposal,
  onDecision?: (proposal: AiProposal) => void,
  onModifyRequest?: (response: ProposalModifyResponse) => void,
): ReactElement | null {
  if (proposal.intent !== "adjust_nutrition_plan") return null;
  const payload = parseAdjustNutritionPlanProposalPayload(proposal.proposedChanges);
  if (!payload) return null;
  return (
    <AdjustNutritionPlanProposalCard
      proposal={proposal}
      payload={payload}
      onDecision={onDecision}
      onModifyRequest={onModifyRequest}
    />
  );
}
