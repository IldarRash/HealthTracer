"use client";

import Link from "next/link";
import { useId } from "react";
import type { WeeklyReviewPackView } from "../../lib/weekly-review-ui-state";
import {
  WEEKLY_REVIEW_CANDIDATE_NOTICE,
  WEEKLY_REVIEW_READ_ONLY_NOTICE,
  buildWeeklyReviewChatRoute,
} from "../../lib/weekly-review-ui-state";
import { Badge } from "../ui";

type WeeklyReviewAdaptationPreviewProps = {
  pack: WeeklyReviewPackView;
  showChatCta?: boolean;
};

export function WeeklyReviewAdaptationPreview({
  pack,
  showChatCta = true,
}: WeeklyReviewAdaptationPreviewProps) {
  const lanesHeadingId = useId();
  const candidatesHeadingId = useId();
  const droppedLanesHeadingId = useId();

  return (
    <div className="weekly-review-pack">
      <div className="notice notice-inline" style={{ marginTop: 0, marginBottom: "var(--space-4)" }}>
        <p style={{ margin: 0 }}>{WEEKLY_REVIEW_READ_ONLY_NOTICE}</p>
      </div>

      <p style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", marginBottom: "var(--space-4)", lineHeight: 1.6 }}>
        {pack.adaptationMessage}
      </p>

      {pack.lanes.length > 0 ? (
        <>
          <h3 id={lanesHeadingId} className="section-label" style={{ marginTop: "var(--space-6)", marginBottom: "var(--space-3)", display: "block" }}>
            Adaptation lanes
          </h3>
          <ul className="goals" aria-labelledby={lanesHeadingId}>
            {pack.lanes.map((lane) => (
              <li key={lane.lane}>
                <strong>{lane.label}</strong>
                <span>
                  <Badge tone={lane.statusLabel === "Eligible for adaptation" ? "success" : "neutral"}>
                    {lane.statusLabel}
                  </Badge>
                </span>
                <p className="dashboard-card__hint">{lane.detail}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {pack.candidates.length > 0 ? (
        <>
          <h3 id={candidatesHeadingId} className="section-label" style={{ marginTop: "var(--space-6)", marginBottom: "var(--space-3)", display: "block" }}>
            Suggested adaptations (preview only)
          </h3>
          <div className="notice notice-inline" style={{ marginTop: 0, marginBottom: "var(--space-3)" }}>
            <p style={{ margin: 0 }}>{WEEKLY_REVIEW_CANDIDATE_NOTICE}</p>
          </div>
          <ul className="goals" aria-labelledby={candidatesHeadingId}>
            {pack.candidates.map((candidate) => (
              <li key={candidate.id}>
                <strong>{candidate.title}</strong>
                <span>
                  <span className="badge-group" aria-label="Adaptation lane and proposal type">
                    <Badge tone="neutral">{candidate.laneLabel}</Badge>
                    <Badge tone="neutral">{candidate.intentLabel}</Badge>
                  </span>
                </span>
                <p className="dashboard-card__hint">{candidate.reason}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {pack.droppedLanes.length > 0 ? (
        <>
          <h3 id={droppedLanesHeadingId} className="section-label" style={{ marginTop: "var(--space-6)", marginBottom: "var(--space-3)", display: "block" }}>
            Not packaged this week
          </h3>
          <ul className="goals" aria-labelledby={droppedLanesHeadingId} style={{ opacity: 0.75 }}>
            {pack.droppedLanes.map((entry) => (
              <li key={`${entry.laneLabel}-${entry.reason}`}>
                <strong>{entry.laneLabel}</strong>
                <span>{entry.reason}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {showChatCta ? (
        <p className="dashboard-card__hint" style={{ marginTop: "var(--space-6)" }}>
          To accept or decline changes, continue in{" "}
          <Link href={buildWeeklyReviewChatRoute()} className="confirmation-card__link">
            Chat
          </Link>{" "}
          and review the formal proposal cards there.
        </p>
      ) : null}
    </div>
  );
}
