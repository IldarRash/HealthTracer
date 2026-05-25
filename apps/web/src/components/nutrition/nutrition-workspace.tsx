"use client";

import { useAuth } from "@clerk/nextjs";
import type { NutritionAdherenceState } from "@health/types";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  apiQueryKeys,
  getActiveNutritionPlan,
  getNutritionAdherenceRefreshQueryKeys,
  getTodayNutritionAdherence,
  listNutritionRevisions,
  upsertTodayNutritionAdherence,
} from "../../lib/api";
import {
  buildAdherenceState,
  formatHydrationProgress,
  formatLocalIsoDate,
  formatTargetCompletionLabel,
  summarizeNutritionTargets,
  targetCompletionKeysForPayload,
  targetCompletionLabel,
  toggleMealCompletion,
  toggleTargetCompletion,
} from "../../lib/nutrition-ui-state";
import { EmptyState, ErrorState, LoadingState } from "../ui";

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatList(values: readonly string[], emptyLabel: string): string {
  return values.length > 0 ? values.join(", ") : emptyLabel;
}

export function NutritionWorkspace() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const today = useMemo(() => formatLocalIsoDate(new Date()), []);
  const [noteDraft, setNoteDraft] = useState("");
  const [hydrationDraft, setHydrationDraft] = useState<string>("");

  const activePlanQuery = useQuery({
    queryKey: apiQueryKeys.nutritionActive,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getActiveNutritionPlan(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? { plan: null, activeRevision: null };
    },
  });

  const revisionsQuery = useQuery({
    queryKey: apiQueryKeys.nutritionRevisions,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listNutritionRevisions(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? [];
    },
  });

  const adherenceQuery = useQuery({
    queryKey: apiQueryKeys.nutritionAdherenceToday,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getTodayNutritionAdherence(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? { adherence: null };
    },
    enabled: Boolean(activePlanQuery.data?.activeRevision),
  });

  const adherenceMutation = useMutation({
    mutationFn: async (input: {
      hydrationLitersConsumed?: number | null;
      mealCompletion?: NutritionAdherenceState["mealCompletion"];
      targetCompletion?: NutritionAdherenceState["targetCompletion"];
      notes?: string[];
    }) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await upsertTodayNutritionAdherence(token, input);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Nutrition adherence could not be saved.");
      }

      return result.data;
    },
    onSuccess: () => {
      for (const queryKey of getNutritionAdherenceRefreshQueryKeys()) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  if (activePlanQuery.isLoading || revisionsQuery.isLoading) {
    return <LoadingState title="Loading your nutrition plan…" />;
  }

  if (activePlanQuery.isError) {
    return (
      <ErrorState
        title="Nutrition plan unavailable"
        description={
          activePlanQuery.error instanceof Error
            ? activePlanQuery.error.message
            : "Your nutrition plan could not be loaded."
        }
      />
    );
  }

  if (revisionsQuery.isError) {
    return (
      <ErrorState
        title="Revision history unavailable"
        description={
          revisionsQuery.error instanceof Error
            ? revisionsQuery.error.message
            : "Nutrition revision history could not be loaded."
        }
      />
    );
  }

  const activeRevision = activePlanQuery.data?.activeRevision ?? null;
  const payload = activeRevision?.payload ?? null;
  const revisions = revisionsQuery.data ?? [];

  if (!activeRevision || !payload) {
    return (
      <EmptyState
        title="No active nutrition plan yet"
        description="Accept a nutrition proposal in Chat to create your first plan revision."
        action={
          <Link href="/chat" className="confirmation-card__link">
            Open Chat →
          </Link>
        }
      />
    );
  }

  const adherenceRecord = adherenceQuery.data?.adherence ?? null;
  const adherenceDate = adherenceRecord?.date ?? today;
  const adherenceState = buildAdherenceState({
    date: adherenceDate,
    payload,
    record: adherenceRecord,
  });
  const targetKeys = targetCompletionKeysForPayload(payload);
  const targetSummary = summarizeNutritionTargets(payload);

  const saveAdherence = (next: Partial<NutritionAdherenceState>) => {
    adherenceMutation.mutate({
      hydrationLitersConsumed:
        next.hydrationLitersConsumed ?? adherenceState.hydrationLitersConsumed,
      mealCompletion: next.mealCompletion ?? adherenceState.mealCompletion,
      targetCompletion: next.targetCompletion ?? adherenceState.targetCompletion,
      notes: next.notes ?? adherenceState.notes,
    });
  };

  return (
    <div className="training-workspace">
      <div className="training-layout">
        <section className="panel panel-prominent training-plan-panel">
          <p className="section-label">Active revision</p>
          <h2>{payload.title}</h2>
          <p>{payload.summary}</p>

          <dl className="training-meta">
            <dt>Revision</dt>
            <dd>#{activeRevision.revisionNumber}</dd>
            <dt>Updated</dt>
            <dd>{formatTimestamp(activeRevision.createdAt)}</dd>
            <dt>Why this revision</dt>
            <dd>{activeRevision.reason}</dd>
          </dl>

          {targetSummary.length > 0 ? (
            <div className="training-notes">
              <h3>Daily targets</h3>
              <ul>
                {targetSummary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {payload.mealStructure.length > 0 ? (
            <div className="training-notes">
              <h3>Meal structure</h3>
              <ul>
                {payload.mealStructure.map((meal) => (
                  <li key={meal.label}>
                    <strong>{meal.label}</strong>
                    {meal.timingHint ? ` · ${meal.timingHint}` : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <dl className="training-meta">
            <dt>Preferences</dt>
            <dd>{formatList(payload.preferences, "None listed")}</dd>
            <dt>Restrictions</dt>
            <dd>{formatList(payload.restrictions, "None listed")}</dd>
            <dt>Allergies to note</dt>
            <dd>{formatList(payload.allergies, "None listed")}</dd>
          </dl>

          {payload.notes.length > 0 ? (
            <div className="training-notes">
              <h3>Coach notes</h3>
              <ul>
                {payload.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="panel panel-secondary panel-wide training-history-panel">
          <p className="section-label">Today&apos;s adherence</p>
          <h2>Daily follow-through ({adherenceDate})</h2>

          {adherenceQuery.isLoading ? <p className="muted-text">Loading adherence…</p> : null}
          {adherenceQuery.isError ? (
            <p className="form-error" role="alert">
              {adherenceQuery.error instanceof Error
                ? adherenceQuery.error.message
                : "Today&apos;s adherence could not be loaded."}
            </p>
          ) : null}

          {!adherenceQuery.isLoading && !adherenceQuery.isError ? (
            <>
              {payload.hydrationLiters != null ? (
                <div className="training-notes">
                  <h3>Hydration progress</h3>
                  <p className="muted-text">
                    Target: {payload.hydrationLiters} L ·{" "}
                    {formatHydrationProgress(
                      adherenceState.hydrationLitersConsumed,
                      payload.hydrationLiters,
                    )}
                  </p>
                  <label className="form-field">
                    <span>Liters consumed</span>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={
                        hydrationDraft ||
                        (adherenceState.hydrationLitersConsumed?.toString() ?? "")
                      }
                      onChange={(event) => setHydrationDraft(event.target.value)}
                      onBlur={() => {
                        const parsed = hydrationDraft.trim()
                          ? Number(hydrationDraft)
                          : adherenceState.hydrationLitersConsumed;
                        saveAdherence({
                          hydrationLitersConsumed:
                            parsed == null || Number.isNaN(parsed) ? null : parsed,
                        });
                        setHydrationDraft("");
                      }}
                    />
                  </label>
                </div>
              ) : null}

              {payload.mealStructure.length > 0 ? (
                <div className="training-notes">
                  <h3>Meals followed</h3>
                  <ul className="training-revision-list">
                    {adherenceState.mealCompletion.map((meal) => (
                      <li key={meal.label} className="training-revision-card nested-card">
                        <label className="form-field">
                          <input
                            type="checkbox"
                            checked={meal.completed}
                            disabled={adherenceMutation.isPending}
                            onChange={() => {
                              saveAdherence({
                                mealCompletion: toggleMealCompletion(
                                  adherenceState.mealCompletion,
                                  meal.label,
                                ),
                              });
                            }}
                          />
                          <span>{meal.label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {targetKeys.length > 0 ? (
                <div className="training-notes">
                  <h3>Target completion</h3>
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
                          className="button-secondary"
                          disabled={adherenceMutation.isPending}
                          onClick={() => {
                            saveAdherence({
                              targetCompletion: toggleTargetCompletion(
                                adherenceState.targetCompletion,
                                key,
                              ),
                            });
                          }}
                        >
                          Cycle status
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="training-notes">
                <h3>Daily note</h3>
                {adherenceState.notes.length > 0 ? (
                  <ul>
                    {adherenceState.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted-text">No notes logged for today yet.</p>
                )}
                <label className="form-field">
                  <span>Add note</span>
                  <textarea
                    rows={2}
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="button-coach"
                  disabled={!noteDraft.trim() || adherenceMutation.isPending}
                  onClick={() => {
                    const trimmed = noteDraft.trim();
                    if (!trimmed) {
                      return;
                    }

                    saveAdherence({
                      notes: [...adherenceState.notes, trimmed],
                    });
                    setNoteDraft("");
                  }}
                >
                  Save note
                </button>
              </div>

              {adherenceRecord ? (
                <details className="proposal-details">
                  <summary>Adherence debug record</summary>
                  <pre>{JSON.stringify(adherenceRecord, null, 2)}</pre>
                </details>
              ) : (
                <p className="muted-text">No adherence record persisted for today yet.</p>
              )}

              {adherenceMutation.isError ? (
                <p className="form-error" role="alert">
                  {adherenceMutation.error instanceof Error
                    ? adherenceMutation.error.message
                    : "Adherence could not be saved."}
                </p>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="panel panel-secondary panel-wide training-history-panel">
          <p className="section-label">Past revisions</p>
          <h2>Revision history</h2>
          {revisions.length === 0 ? (
            <p className="muted-text">No earlier revisions yet.</p>
          ) : (
            <ul className="training-revision-list">
              {revisions.map((revision) => (
                <li
                  key={revision.id}
                  className={
                    revision.id === activeRevision.id
                      ? "training-revision-card nested-card active"
                      : "training-revision-card nested-card"
                  }
                >
                  <div className="training-revision-header">
                    <strong>
                      #{revision.revisionNumber} · {revision.payload.title}
                    </strong>
                    {revision.id === activeRevision.id ? (
                      <span className="badge badge-valid">Active</span>
                    ) : null}
                  </div>
                  <p className="muted-text">{revision.reason}</p>
                  <p className="muted-text">
                    {revision.source} · {formatTimestamp(revision.createdAt)}
                  </p>
                  <details className="proposal-details">
                    <summary>Payload</summary>
                    <pre>{JSON.stringify(revision.payload, null, 2)}</pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
