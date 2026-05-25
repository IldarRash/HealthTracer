"use client";

import { useAuth } from "@clerk/nextjs";
import type { WellbeingCheckInRecord, WellbeingCrisisEvaluation, WellbeingScore } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  apiQueryKeys,
  getWellbeingCheckIn,
  getWellbeingRefreshQueryKeys,
  upsertWellbeingCheckIn,
} from "../../lib/api";
import {
  buildWellbeingCheckInPayload,
  buildWellbeingCheckInSummaryView,
  canSubmitWellbeingCheckIn,
  MOOD_SCORE_LABELS,
  resolveWellbeingCrisisDisplay,
  resolveWellbeingCrisisPreview,
  resolveWellbeingCrisisForParent,
  shouldRenderWellbeingCrisisInCard,
  STRESS_SCORE_LABELS,
} from "../../lib/wellbeing-ui-state";
import { CrisisSupportPanel } from "../wellbeing/crisis-support-panel";
import { WellbeingScaleInput } from "../wellbeing/wellbeing-scale-input";
import { CanvasErrorState, CanvasLoadingState, CompactDomainCard } from "../ui";

type WellbeingCheckInCardProps = {
  selectedDate: string;
  onCrisisSupportChange?: (evaluation: WellbeingCrisisEvaluation | null) => void;
};

function checkInToFormState(checkIn: WellbeingCheckInRecord | null): {
  moodScore: WellbeingScore | null;
  stressScore: WellbeingScore | null;
  note: string;
} {
  return {
    moodScore: checkIn?.moodScore ?? null,
    stressScore: checkIn?.stressScore ?? null,
    note: checkIn?.note ?? "",
  };
}

export function WellbeingCheckInCard({
  selectedDate,
  onCrisisSupportChange,
}: WellbeingCheckInCardProps) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [moodScore, setMoodScore] = useState<WellbeingScore | null>(null);
  const [stressScore, setStressScore] = useState<WellbeingScore | null>(null);
  const [note, setNote] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [serverCrisisSupport, setServerCrisisSupport] = useState<WellbeingCrisisEvaluation | null>(
    null,
  );

  const checkInQuery = useQuery({
    queryKey: apiQueryKeys.wellbeingCheckIn(selectedDate),
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getWellbeingCheckIn(token, selectedDate);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data?.checkIn ?? null;
    },
  });

  const existingCheckIn = checkInQuery.data ?? null;

  useEffect(() => {
    const formState = checkInToFormState(existingCheckIn);
    setMoodScore(formState.moodScore);
    setStressScore(formState.stressScore);
    setNote(formState.note);
    setIsEditing(existingCheckIn == null);
    setServerCrisisSupport(null);
  }, [existingCheckIn, selectedDate]);

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (moodScore == null || stressScore == null) {
        throw new Error("Select mood and stress before saving.");
      }

      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const payload = buildWellbeingCheckInPayload({
        moodScore,
        stressScore,
        note,
      });
      const result = await upsertWellbeingCheckIn(token, selectedDate, payload);

      if (result.error || !result.data) {
        throw new Error(result.error ?? "Check-in could not be saved.");
      }

      return result.data;
    },
    onSuccess: (data) => {
      setServerCrisisSupport(data.crisisSupport);
      setIsEditing(false);

      for (const queryKey of getWellbeingRefreshQueryKeys()) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  const crisisPreview = resolveWellbeingCrisisPreview({ moodScore, note });
  const crisisDisplay = resolveWellbeingCrisisDisplay(crisisPreview, serverCrisisSupport);
  const showCrisisInCard = shouldRenderWellbeingCrisisInCard({
    crisisDisplay,
    delegateToParent: onCrisisSupportChange != null,
  });

  useEffect(() => {
    if (!onCrisisSupportChange) {
      return;
    }

    onCrisisSupportChange(
      resolveWellbeingCrisisForParent({
        preview: resolveWellbeingCrisisPreview({ moodScore, note }),
        serverCrisisSupport,
        persistedCheckIn: existingCheckIn,
      }),
    );
  }, [
    existingCheckIn,
    moodScore,
    note,
    onCrisisSupportChange,
    serverCrisisSupport,
  ]);
  const canSave = canSubmitWellbeingCheckIn({
    moodScore,
    stressScore,
    note,
    existingCheckIn,
  });
  const isBusy = upsertMutation.isPending || checkInQuery.isFetching;
  const summaryView =
    existingCheckIn && !isEditing ? buildWellbeingCheckInSummaryView(existingCheckIn) : null;

  if (checkInQuery.isLoading) {
    return (
      <CompactDomainCard
        className="wellbeing-check-in-card"
        label="Wellbeing check-in"
        title="How are you feeling?"
        titleId="wellbeing-check-in-heading"
        busy
      >
        <CanvasLoadingState compact title="Loading today&apos;s check-in…" />
      </CompactDomainCard>
    );
  }

  if (checkInQuery.isError) {
    return (
      <CompactDomainCard
        className="wellbeing-check-in-card"
        label="Wellbeing check-in"
        title="How are you feeling?"
        titleId="wellbeing-check-in-heading"
      >
        <CanvasErrorState
          compact
          title="Check-in unavailable"
          description={
            checkInQuery.error instanceof Error
              ? checkInQuery.error.message
              : "Check-in could not be loaded."
          }
        />
      </CompactDomainCard>
    );
  }

  return (
    <CompactDomainCard
      className="wellbeing-check-in-card"
      label="Wellbeing check-in"
      title="How are you feeling?"
      titleId="wellbeing-check-in-heading"
      summary="Quick mood and stress snapshot for wellness coaching — separate from daily execution feedback."
    >

      {showCrisisInCard ? <CrisisSupportPanel copy={crisisDisplay.copy!} /> : null}

      {summaryView?.status === "saved" && !isEditing ? (
        <div className="wellbeing-check-in-summary">
          <p className="wellbeing-check-in-summary__line">{summaryView.summaryLine}</p>
          <p className="muted-text">
            {summaryView.moodLabel} mood · {summaryView.stressLabel} stress
          </p>
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
        <div className="wellbeing-check-in-form">
          <WellbeingScaleInput
            id={`wellbeing-mood-${selectedDate}`}
            label="Mood (1–5)"
            value={moodScore}
            optionLabels={MOOD_SCORE_LABELS}
            disabled={isBusy}
            onChange={setMoodScore}
          />

          <WellbeingScaleInput
            id={`wellbeing-stress-${selectedDate}`}
            label="Stress level (1–5)"
            value={stressScore}
            optionLabels={STRESS_SCORE_LABELS}
            disabled={isBusy}
            onChange={setStressScore}
          />

          <div className="training-schedule-field">
            <label htmlFor={`wellbeing-note-${selectedDate}`}>Optional note</label>
            <textarea
              id={`wellbeing-note-${selectedDate}`}
              rows={2}
              className="form-textarea training-notes-input"
              placeholder="Anything you want to remember for yourself…"
              value={note}
              disabled={isBusy}
              maxLength={280}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <div className="action-row proposal-actions">
            <button
              type="button"
              className="button button-primary"
              disabled={!canSave || isBusy}
              onClick={() => upsertMutation.mutate()}
            >
              {upsertMutation.isPending ? "Saving…" : existingCheckIn ? "Update check-in" : "Save check-in"}
            </button>
            {existingCheckIn ? (
              <button
                type="button"
                className="button button-secondary"
                disabled={isBusy}
                onClick={() => {
                  const formState = checkInToFormState(existingCheckIn);
                  setMoodScore(formState.moodScore);
                  setStressScore(formState.stressScore);
                  setNote(formState.note);
                  setIsEditing(false);
                  setServerCrisisSupport(null);
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
                : "Check-in could not be saved."}
            </p>
          ) : null}
        </div>
      )}
    </CompactDomainCard>
  );
}
