"use client";

import { useAuth } from "@clerk/nextjs";
import type { RecoveryCheckInRecord, RecoveryScore } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  apiQueryKeys,
  getRecoveryContext,
  getRecoveryRefreshQueryKeys,
  upsertRecoveryCheckIn,
} from "../../lib/api";
import {
  buildRecoveryCheckInPayload,
  buildRecoveryCheckInSummaryView,
  buildRecoveryFocusView,
  canSubmitRecoveryCheckIn,
  FATIGUE_SCORE_LABELS,
  RECOVERY_MOOD_SCORE_LABELS,
  RECOVERY_STRESS_SCORE_LABELS,
  SORENESS_SCORE_LABELS,
} from "../../lib/recovery-ui-state";
import { WellbeingScaleInput } from "../wellbeing/wellbeing-scale-input";

type RecoveryCheckInCardProps = {
  selectedDate: string;
};

function checkInToFormState(checkIn: RecoveryCheckInRecord | null): {
  soreness: RecoveryScore | null;
  fatigue: RecoveryScore | null;
  moodScore: RecoveryScore | null;
  perceivedStress: RecoveryScore | null;
} {
  return {
    soreness: checkIn?.soreness ?? null,
    fatigue: checkIn?.fatigue ?? null,
    moodScore: checkIn?.moodScore ?? null,
    perceivedStress: checkIn?.perceivedStress ?? null,
  };
}

export function RecoveryCheckInCard({ selectedDate }: RecoveryCheckInCardProps) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [soreness, setSoreness] = useState<RecoveryScore | null>(null);
  const [fatigue, setFatigue] = useState<RecoveryScore | null>(null);
  const [moodScore, setMoodScore] = useState<RecoveryScore | null>(null);
  const [perceivedStress, setPerceivedStress] = useState<RecoveryScore | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const contextQuery = useQuery({
    queryKey: apiQueryKeys.recoveryContext(selectedDate),
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getRecoveryContext(token, selectedDate);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Recovery context could not be loaded.");
      }

      return result.data;
    },
  });

  const existingCheckIn = contextQuery.data?.checkIn ?? null;
  const contextSnapshot = contextQuery.data?.context ?? null;

  useEffect(() => {
    const formState = checkInToFormState(existingCheckIn);
    setSoreness(formState.soreness);
    setFatigue(formState.fatigue);
    setMoodScore(formState.moodScore);
    setPerceivedStress(formState.perceivedStress);
    setIsEditing(existingCheckIn == null);
  }, [existingCheckIn, selectedDate]);

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (soreness == null || fatigue == null) {
        throw new Error("Select soreness and fatigue before saving.");
      }

      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const payload = buildRecoveryCheckInPayload({
        soreness,
        fatigue,
        moodScore,
        perceivedStress,
        date: selectedDate,
      });
      const result = await upsertRecoveryCheckIn(token, payload);

      if (result.error || !result.data) {
        throw new Error(result.error ?? "Recovery check-in could not be saved.");
      }

      return result.data;
    },
    onSuccess: () => {
      setIsEditing(false);

      for (const queryKey of getRecoveryRefreshQueryKeys()) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  const canSave = canSubmitRecoveryCheckIn({
    soreness,
    fatigue,
    moodScore,
    perceivedStress,
    existingCheckIn,
  });
  const isBusy = upsertMutation.isPending || contextQuery.isFetching;
  const summaryView =
    existingCheckIn && !isEditing ? buildRecoveryCheckInSummaryView(existingCheckIn) : null;
  const focusView = contextSnapshot ? buildRecoveryFocusView(contextSnapshot) : null;

  if (contextQuery.isLoading) {
    return (
      <section className="recovery-check-in-card nested-card" aria-busy="true">
        <p className="section-label">Recovery focus</p>
        <p className="muted-text">Loading recovery context…</p>
      </section>
    );
  }

  if (contextQuery.isError) {
    return (
      <section className="recovery-check-in-card nested-card">
        <p className="section-label">Recovery focus</p>
        <p className="form-error" role="alert">
          {contextQuery.error instanceof Error
            ? contextQuery.error.message
            : "Recovery context could not be loaded."}
        </p>
      </section>
    );
  }

  return (
    <section
      className="recovery-check-in-card nested-card"
      aria-labelledby="recovery-check-in-heading"
    >
      <p className="section-label">Recovery focus</p>
      <h3 id="recovery-check-in-heading">How is your body feeling?</h3>
      <p className="muted-text">
        Wellness context for coaching — soreness, fatigue, and optional mood or stress. Not a
        medical assessment.
      </p>

      {focusView ? (
        <div className="recovery-focus-panel nested-card">
          <div className="recovery-focus-header">
            <strong className="recovery-focus-title">Today&apos;s recovery focus</strong>
            <span className={focusView.bandBadgeClass}>{focusView.bandLabel}</span>
          </div>
          <p className="recovery-focus-message">{focusView.focusMessage}</p>
          <p className="muted-text recovery-focus-sufficiency">{focusView.sufficiencyMessage}</p>
          {focusView.signalLabels.length > 0 ? (
            <ul className="recovery-focus-signals">
              {focusView.signalLabels.map((label) => (
                <li key={label} className="muted-text">
                  {label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {summaryView?.status === "saved" && !isEditing ? (
        <div className="recovery-check-in-summary">
          <p className="recovery-check-in-summary__line">{summaryView.summaryLine}</p>
          <p className="muted-text">{summaryView.detailLine}</p>
          <p className="muted-text">{summaryView.updatedLabel}</p>
          <div className="action-row proposal-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={isBusy}
              onClick={() => setIsEditing(true)}
            >
              Update check-in
            </button>
          </div>
        </div>
      ) : (
        <div className="recovery-check-in-form">
          <WellbeingScaleInput
            id={`recovery-soreness-${selectedDate}`}
            label="Soreness (1–5)"
            value={soreness}
            optionLabels={SORENESS_SCORE_LABELS}
            disabled={isBusy}
            onChange={setSoreness}
          />

          <WellbeingScaleInput
            id={`recovery-fatigue-${selectedDate}`}
            label="Fatigue (1–5)"
            value={fatigue}
            optionLabels={FATIGUE_SCORE_LABELS}
            disabled={isBusy}
            onChange={setFatigue}
          />

          <WellbeingScaleInput
            id={`recovery-mood-${selectedDate}`}
            label="Mood (optional, 1–5)"
            value={moodScore}
            optionLabels={RECOVERY_MOOD_SCORE_LABELS}
            disabled={isBusy}
            onChange={setMoodScore}
          />

          <WellbeingScaleInput
            id={`recovery-stress-${selectedDate}`}
            label="Perceived stress (optional, 1–5)"
            value={perceivedStress}
            optionLabels={RECOVERY_STRESS_SCORE_LABELS}
            disabled={isBusy}
            onChange={setPerceivedStress}
          />

          <div className="action-row proposal-actions">
            <button
              type="button"
              className="button button-primary"
              disabled={!canSave || isBusy}
              onClick={() => upsertMutation.mutate()}
            >
              {upsertMutation.isPending
                ? "Saving…"
                : existingCheckIn
                  ? "Update check-in"
                  : "Save check-in"}
            </button>
            {existingCheckIn ? (
              <button
                type="button"
                className="button button-secondary"
                disabled={isBusy}
                onClick={() => {
                  const formState = checkInToFormState(existingCheckIn);
                  setSoreness(formState.soreness);
                  setFatigue(formState.fatigue);
                  setMoodScore(formState.moodScore);
                  setPerceivedStress(formState.perceivedStress);
                  setIsEditing(false);
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>

          {upsertMutation.isError ? (
            <p className="form-error" role="alert">
              {upsertMutation.error instanceof Error
                ? upsertMutation.error.message
                : "Recovery check-in could not be saved."}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
