"use client";

import { useAuth } from "@clerk/nextjs";
import type { NutritionAdherenceState, TodayNutritionDetail } from "@health/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getNutritionAdherenceRefreshQueryKeys, upsertNutritionAdherence } from "../../lib/api";
import {
  formatHydrationProgress,
  formatTargetCompletionLabel,
  parseHydrationInput,
  targetCompletionKeysForPayload,
  targetCompletionLabel,
  toggleMealCompletion,
  toggleTargetCompletion,
} from "../../lib/nutrition-ui-state";
import {
  buildTodayNutritionAdherenceView,
  canAppendTodayNutritionNote,
  formatMealCompletionSummary,
  formatTodayNutritionPlanSummary,
  hasTodayNutritionAdherenceSaved,
  MAX_TODAY_NUTRITION_NOTE_LENGTH,
  resolveTodayNutritionCardPhase,
  todayNutritionPayload,
} from "../../lib/today-nutrition-ui-state";
import {
  CanvasEmptyState,
  CompactDomainCard,
  ProgressiveDisclosure,
  StatusBadge,
} from "../ui";

type TodayNutritionCardProps = {
  nutrition: TodayNutritionDetail | null;
  selectedDate: string;
  isBusy: boolean;
  onRefresh: () => void;
};

export function TodayNutritionCard({
  nutrition,
  selectedDate,
  isBusy,
  onRefresh,
}: TodayNutritionCardProps) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [noteDraft, setNoteDraft] = useState("");
  const [hydrationDraft, setHydrationDraft] = useState("");
  const [saveSucceeded, setSaveSucceeded] = useState(false);

  const phase = resolveTodayNutritionCardPhase(nutrition);
  const payload = nutrition ? todayNutritionPayload(nutrition) : null;
  const adherenceState = nutrition ? buildTodayNutritionAdherenceView(nutrition) : null;
  const targetKeys = payload ? targetCompletionKeysForPayload(payload) : [];

  useEffect(() => {
    setNoteDraft("");
    setHydrationDraft("");
    setSaveSucceeded(false);
  }, [nutrition, selectedDate]);

  const adherenceMutation = useMutation({
    mutationFn: async (input: Partial<NutritionAdherenceState>) => {
      if (!adherenceState) {
        throw new Error("Nutrition adherence is unavailable.");
      }

      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await upsertNutritionAdherence(token, selectedDate, {
        hydrationLitersConsumed:
          input.hydrationLitersConsumed ?? adherenceState.hydrationLitersConsumed,
        mealCompletion: input.mealCompletion ?? adherenceState.mealCompletion,
        targetCompletion: input.targetCompletion ?? adherenceState.targetCompletion,
        notes: input.notes ?? adherenceState.notes,
      });

      if (result.error || !result.data) {
        throw new Error(result.error ?? "Nutrition adherence could not be saved.");
      }

      return result.data;
    },
    onSuccess: () => {
      setSaveSucceeded(true);
      for (const queryKey of getNutritionAdherenceRefreshQueryKeys()) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onRefresh();
    },
  });

  const cardBusy = isBusy || adherenceMutation.isPending;

  const saveAdherence = (next: Partial<NutritionAdherenceState>) => {
    if (cardBusy || !adherenceState) {
      return;
    }

    adherenceMutation.mutate(next);
  };

  if (phase === "empty") {
    return (
      <CompactDomainCard
        className="today-nutrition-panel"
        label="Today&apos;s nutrition"
        title="Nutrition"
        titleId="today-nutrition-heading"
      >
        <CanvasEmptyState
          compact
          title="No active nutrition plan"
          description="Accept a nutrition proposal in Chat to see today's meals, hydration focus, and targets here."
          action={
            <div className="action-row proposal-actions">
              <Link href="/chat" className="confirmation-card__link">
                Ask the coach →
              </Link>
              <Link href="/nutrition" className="confirmation-card__link">
                Open Nutrition →
              </Link>
            </div>
          }
        />
      </CompactDomainCard>
    );
  }

  if (!nutrition || !payload || !adherenceState) {
    return null;
  }

  const mealSummary = formatMealCompletionSummary(adherenceState.mealCompletion);
  const adherenceSaved = hasTodayNutritionAdherenceSaved(nutrition);

  return (
    <CompactDomainCard
      className="today-nutrition-panel"
      label="Today&apos;s nutrition"
      title={payload.title}
      titleId="today-nutrition-heading"
      summary={formatTodayNutritionPlanSummary(payload)}
      badge={
        adherenceSaved ? (
          <StatusBadge className="badge badge-session-completed">Saved</StatusBadge>
        ) : (
          <StatusBadge className="badge badge-session-planned">Not logged</StatusBadge>
        )
      }
      busy={cardBusy}
      actions={
        <div className="today-nutrition-links">
          <Link href="/nutrition" className="confirmation-card__link">
            Open Nutrition →
          </Link>
          <Link href="/chat" className="confirmation-card__link">
            Ask the coach to adjust this plan →
          </Link>
        </div>
      }
    >
      {phase === "partial" ? (
        <p className="muted-text">
          Your plan is active, but meals, hydration, and targets are not configured yet. Ask the
          coach to refine this plan.
        </p>
      ) : null}

      {payload.mealStructure.length > 0 ? (
        <ProgressiveDisclosure className="training-notes" summary="Meals" defaultOpen>
          <p className="muted-text">{mealSummary}</p>
          <ul className="training-revision-list">
            {adherenceState.mealCompletion.map((meal) => {
              const timingHint = payload.mealStructure.find((slot) => slot.label === meal.label)
                ?.timingHint;

              return (
                <li key={meal.label} className="training-revision-card nested-card">
                  <label className="form-field">
                    <input
                      type="checkbox"
                      checked={meal.completed}
                      disabled={cardBusy}
                      onChange={() => {
                        saveAdherence({
                          mealCompletion: toggleMealCompletion(
                            adherenceState.mealCompletion,
                            meal.label,
                          ),
                        });
                      }}
                    />
                    <span>
                      {meal.label}
                      {timingHint ? ` · ${timingHint}` : ""}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </ProgressiveDisclosure>
      ) : null}

      {payload.hydrationLiters != null ? (
        <ProgressiveDisclosure className="training-notes" summary="Hydration focus" defaultOpen>
          <p className="muted-text">
            Target: {payload.hydrationLiters} L ·{" "}
            {formatHydrationProgress(
              adherenceState.hydrationLitersConsumed,
              payload.hydrationLiters,
            )}
          </p>
          <label className="form-field" htmlFor="today-nutrition-hydration">
            <span>Liters consumed</span>
            <input
              id="today-nutrition-hydration"
              type="number"
              min={0}
              step={0.1}
              disabled={cardBusy}
              value={
                hydrationDraft ||
                (adherenceState.hydrationLitersConsumed?.toString() ?? "")
              }
              onChange={(event) => setHydrationDraft(event.target.value)}
              onBlur={() => {
                const parsed = hydrationDraft.trim()
                  ? parseHydrationInput(hydrationDraft)
                  : adherenceState.hydrationLitersConsumed;

                if (parsed === adherenceState.hydrationLitersConsumed) {
                  setHydrationDraft("");
                  return;
                }

                saveAdherence({
                  hydrationLitersConsumed: parsed,
                });
                setHydrationDraft("");
              }}
            />
          </label>
        </ProgressiveDisclosure>
      ) : null}

      {targetKeys.length > 0 ? (
        <ProgressiveDisclosure className="training-notes" summary="Daily targets" defaultOpen>
          <ul className="training-revision-list">
            {targetKeys.map((key) => (
              <li key={key} className="training-revision-card nested-card">
                <div className="training-revision-header">
                  <strong>{targetCompletionLabel(key)}</strong>
                  <span className="muted-text">
                    {formatTargetCompletionLabel(adherenceState.targetCompletion[key])}
                  </span>
                </div>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={cardBusy}
                  onClick={() => {
                    saveAdherence({
                      targetCompletion: toggleTargetCompletion(
                        adherenceState.targetCompletion,
                        key,
                      ),
                    });
                  }}
                >
                  {adherenceMutation.isPending ? "Saving…" : "Cycle status"}
                </button>
              </li>
            ))}
          </ul>
        </ProgressiveDisclosure>
      ) : null}

      <ProgressiveDisclosure className="training-notes" summary="Daily note" defaultOpen>
        {adherenceState.notes.length > 0 ? (
          <ul>
            {adherenceState.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : (
          <p className="muted-text">Optional note for this day — not shared with AI automatically.</p>
        )}
        <label className="form-field" htmlFor="today-nutrition-note">
          <span>Add note</span>
          <textarea
            id="today-nutrition-note"
            rows={2}
            maxLength={MAX_TODAY_NUTRITION_NOTE_LENGTH}
            value={noteDraft}
            disabled={cardBusy}
            onChange={(event) => setNoteDraft(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="button button-secondary"
          disabled={!canAppendTodayNutritionNote(adherenceState.notes, noteDraft) || cardBusy}
          onClick={() => {
            const trimmed = noteDraft.trim();
            if (!canAppendTodayNutritionNote(adherenceState.notes, trimmed)) {
              return;
            }

            saveAdherence({
              notes: [...adherenceState.notes, trimmed],
            });
            setNoteDraft("");
          }}
        >
          {adherenceMutation.isPending ? "Saving…" : "Save note"}
        </button>
      </ProgressiveDisclosure>

      {saveSucceeded && !adherenceMutation.isPending ? (
        <p className="muted-text" role="status">
          Nutrition adherence saved for {selectedDate}.
        </p>
      ) : null}

      {adherenceMutation.isError ? (
        <p className="form-error" role="alert">
          {adherenceMutation.error instanceof Error
            ? adherenceMutation.error.message
            : "Nutrition adherence could not be saved."}
        </p>
      ) : null}
    </CompactDomainCard>
  );
}
