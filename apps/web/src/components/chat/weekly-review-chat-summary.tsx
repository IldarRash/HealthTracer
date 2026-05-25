"use client";

import { useId } from "react";
import type { ChatWeeklyReviewPackView } from "../../lib/weekly-review-ui-state";
import { WEEKLY_REVIEW_CHAT_ACTION_NOTICE } from "../../lib/weekly-review-ui-state";
import { Badge } from "../ui";

type WeeklyReviewChatSummaryProps = {
  pack: ChatWeeklyReviewPackView;
  titleId?: string;
};

export function WeeklyReviewChatSummary({
  pack,
  titleId,
}: WeeklyReviewChatSummaryProps) {
  const generatedTitleId = useId();
  const headingId = titleId ?? generatedTitleId;
  const lanesHeadingId = useId();
  const droppedLanesHeadingId = useId();

  return (
    <aside
      className="chat-weekly-review-summary notice"
      role="region"
      aria-labelledby={headingId}
    >
      <h3 id={headingId} className="section-label">
        Weekly review summary
      </h3>

      <p className="chat-weekly-review-summary__message">{pack.adaptationMessage}</p>

      {pack.lanes.length > 0 ? (
        <>
          <h4 id={lanesHeadingId} className="section-label">
            Adaptation lanes
          </h4>
          <ul className="goals" aria-labelledby={lanesHeadingId}>
            {pack.lanes.map((lane) => (
              <li key={lane.lane}>
                <strong>{lane.label}</strong>
                <span>
                  <Badge
                    tone={
                      lane.statusLabel === "Eligible for adaptation"
                        ? "success"
                        : lane.statusLabel === "Explanation only"
                          ? "neutral"
                          : "neutral"
                    }
                  >
                    {lane.statusLabel}
                  </Badge>
                </span>
                <p className="dashboard-card__hint">{lane.detail}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {pack.droppedLanes.length > 0 ? (
        <>
          <h4 id={droppedLanesHeadingId} className="section-label">
            Not packaged this week
          </h4>
          <ul
            className="goals chat-weekly-review-summary__dropped"
            aria-labelledby={droppedLanesHeadingId}
          >
            {pack.droppedLanes.map((entry) => (
              <li key={`${entry.laneLabel}-${entry.reason}`}>
                <strong>{entry.laneLabel}</strong>
                <span>{entry.reason}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="dashboard-card__hint chat-weekly-review-summary__notice">
        {WEEKLY_REVIEW_CHAT_ACTION_NOTICE}
      </p>
    </aside>
  );
}
