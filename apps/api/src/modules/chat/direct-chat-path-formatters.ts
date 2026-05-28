import {
  buildDefaultAiBehaviorConfig,
  formatTodaySummaryReadMessage as formatTodaySummaryReadMessageFromConfig,
  formatWorkoutMarkedDoneMessage as formatWorkoutMarkedDoneMessageFromConfig,
  type DirectPathReplyTemplates,
  type TodayDayResponseBase,
} from "@health/types";

const DEFAULT_REPLY_TEMPLATES = buildDefaultAiBehaviorConfig().directPaths.replyTemplates;

/** @deprecated Import from @health/types or pass config replyTemplates explicitly. */
export const DIRECT_PATH_NO_PENDING_WORKOUT_MESSAGE =
  DEFAULT_REPLY_TEMPLATES.markWorkoutDone.noPendingWorkoutMessage;

/** @deprecated Import from @health/types or pass config replyTemplates explicitly. */
export const DIRECT_PATH_MULTIPLE_PENDING_WORKOUTS_MESSAGE =
  DEFAULT_REPLY_TEMPLATES.markWorkoutDone.multiplePendingWorkoutsMessage;

export function formatTodaySummaryReadMessage(
  day: TodayDayResponseBase,
  dateLabel: string,
  replyTemplates: DirectPathReplyTemplates = DEFAULT_REPLY_TEMPLATES,
): string {
  return formatTodaySummaryReadMessageFromConfig(day, dateLabel, replyTemplates.todaySummary);
}

export function formatWorkoutMarkedDoneMessage(
  label: string,
  replyTemplates: DirectPathReplyTemplates = DEFAULT_REPLY_TEMPLATES,
): string {
  return formatWorkoutMarkedDoneMessageFromConfig(label, replyTemplates.markWorkoutDone);
}
