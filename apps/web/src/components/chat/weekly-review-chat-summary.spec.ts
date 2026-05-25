import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WEEKLY_REVIEW_CHAT_ACTION_NOTICE } from "../../lib/weekly-review-ui-state.js";

const chatDir = dirname(fileURLToPath(import.meta.url));
const weeklyReviewSummarySource = readFileSync(
  join(chatDir, "weekly-review-chat-summary.tsx"),
  "utf8",
);

describe("WeeklyReviewChatSummary", () => {
  it("collapses lane details behind a native summary control", () => {
    expect(weeklyReviewSummarySource).toContain("<details");
    expect(weeklyReviewSummarySource).toContain("<summary>");
    expect(weeklyReviewSummarySource).toContain(
      'className="chat-weekly-review-summary__details"',
    );
    expect(weeklyReviewSummarySource).toContain("formatLaneDetailsSummary");
  });

  it("keeps collapsed lane lists accessible via labelled headings", () => {
    expect(weeklyReviewSummarySource).toContain("titleId={headingId}");
    expect(weeklyReviewSummarySource).toContain('aria-labelledby={lanesHeadingId}');
    expect(weeklyReviewSummarySource).toContain(
      'aria-labelledby={droppedLanesHeadingId}',
    );
    expect(weeklyReviewSummarySource).toContain("Adaptation lanes");
    expect(weeklyReviewSummarySource).toContain("Not packaged this week");
  });

  it("surfaces coach-forward action notice outside collapsed details", () => {
    expect(weeklyReviewSummarySource).toContain("WEEKLY_REVIEW_CHAT_ACTION_NOTICE");
    expect(weeklyReviewSummarySource).toContain(
      "chat-weekly-review-summary__notice",
    );
    expect(WEEKLY_REVIEW_CHAT_ACTION_NOTICE).toContain("proposal cards");
    expect(WEEKLY_REVIEW_CHAT_ACTION_NOTICE.toLowerCase()).not.toContain(
      "automatically",
    );
  });
});
