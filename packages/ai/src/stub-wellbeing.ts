import {
  aiWellbeingContextSummarySchema,
  type AiWellbeingContextSummary,
  type WellbeingTrendDirection,
} from "@health/types";

export function isWellbeingRelatedMessage(normalizedMessage: string): boolean {
  return (
    normalizedMessage.includes("stress") ||
    normalizedMessage.includes("motivation") ||
    normalizedMessage.includes("recovery") ||
    normalizedMessage.includes("mood") ||
    normalizedMessage.includes("wellbeing") ||
    normalizedMessage.includes("well-being") ||
    normalizedMessage.includes("how am i feeling") ||
    normalizedMessage.includes("feel lately")
  );
}

export function parseWellbeingSummaryFromContext(
  coachingContext: Record<string, unknown>,
): AiWellbeingContextSummary | null {
  const parsed = aiWellbeingContextSummarySchema.safeParse(coachingContext.wellbeingSummary);
  return parsed.success ? parsed.data : null;
}

function describeTrendDirection(
  direction: WellbeingTrendDirection,
  metric: "mood" | "stress",
): string | null {
  if (direction === "unknown") {
    return null;
  }

  if (direction === "stable") {
    return metric === "mood"
      ? "Your mood has been fairly steady over recent check-ins."
      : "Your stress levels have been fairly steady over recent check-ins.";
  }

  if (metric === "mood") {
    return direction === "up"
      ? "Your recent mood check-ins trend a bit higher."
      : "Your recent mood check-ins trend a bit lower.";
  }

  return direction === "up"
    ? "Your recent stress check-ins trend a bit higher."
    : "Your recent stress check-ins trend a bit lower.";
}

export function buildWellbeingCoachReply(summary: AiWellbeingContextSummary): string {
  if (summary.dataSufficiency === "insufficient") {
    return "I do not have recent wellbeing check-in data yet. Logging mood and stress on Today helps me personalize wellness coaching safely without guessing.";
  }

  const parts: string[] = [];
  const moodTrend = describeTrendDirection(summary.moodTrendDirection, "mood");
  const stressTrend = describeTrendDirection(summary.stressTrendDirection, "stress");

  if (moodTrend) {
    parts.push(moodTrend);
  } else if (summary.latestMoodScore != null) {
    parts.push(`Your latest mood check-in was ${summary.latestMoodScore} out of 5.`);
  }

  if (stressTrend) {
    parts.push(stressTrend);
  } else if (summary.latestStressScore != null) {
    parts.push(`Your latest stress check-in was ${summary.latestStressScore} out of 5.`);
  }

  if (summary.dataSufficiency === "partial") {
    parts.push("Check-in data is still limited, so I am keeping this summary conservative.");
  }

  parts.push(
    "I can help with wellness-focused habits and recovery routines you can review before anything changes.",
  );

  return parts.join(" ");
}
