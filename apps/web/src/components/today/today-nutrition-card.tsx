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
import { EmptyState } from "../ui";

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
      <section className="today-nutrition-panel nested-card" aria-labelledby="today-nutrition-heading">
        <p className="section-label">Today&apos;s nutrition</p>
        <EmptyState
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
      </section>
    );
  }

  if (!nutrition || !payload || !adherenceState) {
    return null;
  }

  const mealSummary = formatMealCompletionSummary(adherenceState.mealCompletion);
  const adherenceSaved = hasTodayNutritionAdherenceSaved(nutrition);

  return (
    <section
      className="today-nutrition-panel nested-card"
      aria-labelledby="today-nutrition-heading"
      aria-busy={cardBusy || undefined}
    >
      <p className="section-label">Today&apos;s nutrition</p>
      <div className="training-session-header">
        <div>
          <h3 id="today-nutrition-heading">{payload.title}</h3>
          <p className="muted-text">{formatTodayNutritionPlanSummary(payload)}</p>
        </div>
        {adherenceSaved ? (
          <span className="badge badge-session-completed">Saved</span>
        ) : (
          <span className="badge badge-session-planned">Not logged</span>
        )}
      </div>

      {phase === "partial" ? (
        <p className="muted-text">
          Your plan is active, but meals, hydration, and targets are not configured yet. Ask the
          coach to refine this plan.
        </p>
      ) : null}

      {payload.mealStructure.length > 0 ? (
        <div className="training-notes">
          <h4>Meals</h4>
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
        </div>
      ) : null}

      {payload.hydrationLiters != null ? (
        <div className="training-notes">
          <h4>Hydration focus</h4>
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
        </div>
      ) : null}

      {targetKeys.length > 0 ? (
        <div className="training-notes">
          <h4>Daily targets</h4>
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
        </div>
      ) : null}

      <div className="training-notes">
        <h4>Daily note</h4>
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
      </div>

      <div className="action-row proposal-actions today-nutrition-links">
        <Link href="/nutrition" className="confirmation-card__link">
          Open Nutrition →
        </Link>
        <Link href="/chat" className="confirmation-card__link">
          Ask the coach to adjust this plan →
        </Link>
      </div>

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
    </section>
  );
}
