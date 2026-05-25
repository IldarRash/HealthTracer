"use client";

import { useId } from "react";
import type { ChatWeeklyReviewPackView } from "../../lib/weekly-review-ui-state";
import { WEEKLY_REVIEW_CHAT_ACTION_NOTICE } from "../../lib/weekly-review-ui-state";
import { Badge, ChatMetadataPanel } from "../ui";

type WeeklyReviewChatSummaryProps = {
  pack: ChatWeeklyReviewPackView;
  titleId?: string;
};

function formatLaneDetailsSummary(laneCount: number, droppedCount: number): string {
  const parts: string[] = [];

  if (laneCount > 0) {
    parts.push(`${laneCount} adaptation lane${laneCount === 1 ? "" : "s"}`);
  }

  if (droppedCount > 0) {
    parts.push(`${droppedCount} not packaged`);
  }

  return parts.join(" · ");
}

export function WeeklyReviewChatSummary({
  pack,
  titleId,
}: WeeklyReviewChatSummaryProps) {
  const generatedTitleId = useId();
  const headingId = titleId ?? generatedTitleId;
  const lanesHeadingId = useId();
  const droppedLanesHeadingId = useId();
  const hasLaneDetails = pack.lanes.length > 0 || pack.droppedLanes.length > 0;
  const detailsSummary = formatLaneDetailsSummary(pack.lanes.length, pack.droppedLanes.length);

  return (
    <ChatMetadataPanel
      title="Weekly review summary"
      titleId={headingId}
      tone="notice"
      className="chat-weekly-review-summary"
    >
      <p className="chat-weekly-review-summary__message">{pack.adaptationMessage}</p>

      {hasLaneDetails ? (
        <details className="chat-weekly-review-summary__details">
          <summary>{detailsSummary || "View adaptation details"}</summary>

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
        </details>
      ) : null}

      <p className="dashboard-card__hint chat-weekly-review-summary__notice">
        {WEEKLY_REVIEW_CHAT_ACTION_NOTICE}
      </p>
    </ChatMetadataPanel>
  );
}
