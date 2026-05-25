"use client";

import type { WellbeingCheckInAggregatesResponse } from "@health/types";
import Link from "next/link";
import { buildWellbeingHistoryPanelView } from "../../lib/wellbeing-ui-state";
import { EmptyState } from "../ui";

type WellbeingHistoryPanelProps = {
  aggregates: WellbeingCheckInAggregatesResponse | null;
  anchorDate: string;
  isLoading?: boolean;
  errorMessage?: string | null;
};

export function WellbeingHistoryPanel({
  aggregates,
  anchorDate,
  isLoading = false,
  errorMessage = null,
}: WellbeingHistoryPanelProps) {
  if (isLoading) {
    return (
      <div className="wellbeing-history-panel">
        <p className="muted-text">Loading wellbeing history…</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <p className="form-error" role="alert">
        {errorMessage}
      </p>
    );
  }

  const view = buildWellbeingHistoryPanelView({
    aggregates: aggregates?.aggregates ?? [],
    history: [],
    summary: aggregates?.summary ?? null,
    anchorDate,
  });

  if (view.status === "empty") {
    return (
      <EmptyState
        title={view.title}
        description={view.message}
        action={
          <Link href="/today" className="confirmation-card__link">
            Log a check-in on Today →
          </Link>
        }
      />
    );
  }

  return (
    <div className="wellbeing-history-panel">
      <p className="dashboard-card__hint">{view.summaryLine}</p>
      <p className="muted-text">{view.sufficiencyMessage}</p>
      {view.sparse ? (
        <p className="muted-text">Keep logging on Today to fill in this week.</p>
      ) : null}

      <div className="wellbeing-trend-meta">
        <span>Mood: {view.moodTrendLabel}</span>
        <span>Stress: {view.stressTrendLabel}</span>
        <span>{view.streakLabel}</span>
      </div>

      <div className="wellbeing-trend-chart" aria-label="Seven day mood and stress history">
        <div className="wellbeing-trend-row">
          <span className="wellbeing-trend-row__label">Mood</span>
          <div className="trend-strip wellbeing-trend-strip">
            {view.days.map((day) => (
              <div key={`mood-${day.date}`} className="wellbeing-trend-day">
                <div
                  className="trend-strip__bar wellbeing-trend-bar"
                  title={
                    day.moodScore != null
                      ? `${day.shortLabel}: mood ${day.moodScore}/5`
                      : `${day.shortLabel}: no check-in`
                  }
                >
                  <span
                    className="trend-strip__fill wellbeing-trend-fill wellbeing-trend-fill--mood"
                    style={{ width: `${day.moodFillPercent}%` }}
                  />
                </div>
                <span className="wellbeing-trend-day__label">{day.shortLabel}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="wellbeing-trend-row">
          <span className="wellbeing-trend-row__label">Stress</span>
          <div className="trend-strip wellbeing-trend-strip">
            {view.days.map((day) => (
              <div key={`stress-${day.date}`} className="wellbeing-trend-day">
                <div
                  className="trend-strip__bar wellbeing-trend-bar"
                  title={
                    day.stressScore != null
                      ? `${day.shortLabel}: stress ${day.stressScore}/5`
                      : `${day.shortLabel}: no check-in`
                  }
                >
                  <span
                    className="trend-strip__fill wellbeing-trend-fill wellbeing-trend-fill--stress"
                    style={{ width: `${day.stressFillPercent}%` }}
                  />
                </div>
                <span className="wellbeing-trend-day__label">{day.shortLabel}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
