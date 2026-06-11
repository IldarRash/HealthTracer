"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import type {
  ExerciseCatalogMetadata,
  ExerciseMedia,
  WorkoutPlanDay,
  WorkoutPlanRevision,
  WorkoutSession,
} from "@health/types";
import { aggregateWorkoutWeek } from "@health/types";
import {
  apiQueryKeys,
  getActiveWorkoutPlan,
  listWorkoutRevisions,
} from "../../lib/api";
import {
  buildTrainingWeekStripView,
  formatLocalIsoDate,
  getWorkoutPlanDayKey,
  getWorkoutPlanDayLabel,
  hasActiveWorkoutPlan,
} from "../../lib/training-ui-state";
import {
  formatPlanRevisionSource,
  formatPlanRevisionTimestamp,
  formatRevisionReason,
} from "../../lib/plan-view-ui-state";
import {
  resolvePlanExerciseCatalogMetadata,
  getExerciseMediaFallbackLabel,
} from "../../lib/exercise-catalog-ui-state";
import { ExerciseCatalogDetails } from "../ui/exercise-catalog-details";
import {
  ChangeBanner,
  CoachNotes,
  DailyExecCard,
  DsTrendStrip,
  Icon,
  IconBadge,
  LoadingScreen,
  MediaCard,
  RevisionFacts,
  RevisionHistoryDark,
  type RevisionHistoryRow,
} from "../ui";
import { TrainingProgressPanel } from "./training-progress-panel";
import { ErrorState } from "../ui";

// ── Local type helpers ────────────────────────────────────────────

type ExerciseCardData = {
  title: string;
  meta: string;
  duration?: string;
  tags: string[];
  poster: number;
  /** Full catalog metadata for the technique preview panel. */
  catalog: ExerciseCatalogMetadata | null;
};

// ── ActivePlanHeader ──────────────────────────────────────────────

type ActivePlanHeaderEmptyProps = { empty: true };
type ActivePlanHeaderDataProps = {
  empty?: false;
  name: string;
  summary: string;
  revisionNumber: number;
  weekDays: readonly { label: string; value: number }[];
  statsWorkoutsPerWeek: number;
  statsCompleted: number;
  statsActiveDays: number;
};
type ActivePlanHeaderProps = ActivePlanHeaderEmptyProps | ActivePlanHeaderDataProps;

function ActivePlanHeader(props: ActivePlanHeaderProps): ReactElement {
  if (props.empty) {
    return (
      <div
        style={{
          background: "var(--color-surface-card)",
          border: "1px solid var(--color-border-default)",
          borderRadius: 16,
          padding: 22,
        }}
      >
        <div
          style={{
            borderRadius: 14,
            border: "1px dashed var(--color-border-muted)",
            padding: "30px 24px",
            textAlign: "center",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 54,
              height: 54,
              borderRadius: 15,
              margin: "0 auto 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(58,141,255,0.12)",
            }}
          >
            <Icon name="dumbbell" size={26} stroke="var(--color-metric-blue)" />
          </div>
          <p
            style={{
              fontSize: 19,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              letterSpacing: -0.3,
              margin: 0,
            }}
          >
            No active plan yet
          </p>
          <p
            style={{
              fontSize: 13.5,
              color: "var(--color-text-muted)",
              marginTop: 9,
              lineHeight: 1.5,
              maxWidth: 400,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            A workout plan is created from an accepted coach proposal. Tell the coach your
            goals in chat and accept the plan they build for you.
          </p>
          <Link
            href="/chat"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 18,
              padding: "9px 18px",
              borderRadius: 12,
              background: "rgba(58,141,255,0.12)",
              border: "1px solid rgba(58,141,255,0.28)",
              color: "var(--color-metric-blue)",
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: "none",
              transition: "background 150ms ease",
            }}
          >
            <Icon name="chat" size={15} stroke="var(--color-metric-blue)" />
            Open Chat
          </Link>
        </div>
      </div>
    );
  }

  const { name, summary, revisionNumber, weekDays, statsWorkoutsPerWeek, statsCompleted, statsActiveDays } = props;

  return (
    <div
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 16,
        padding: 22,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 28,
          alignItems: "center",
        }}
      >
        {/* Left: plan info + stats */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Chips */}
          <div
            style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}
          >
            <span
              className="ds-chip ds-chip--blue"
              style={{
                padding: "3px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: "rgba(58,141,255,0.14)",
                color: "var(--color-metric-blue)",
              }}
            >
              Active plan
            </span>
            <span
              className="ds-chip ds-chip--neutral"
              style={{
                padding: "3px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: "rgba(255,255,255,0.07)",
                color: "var(--color-text-secondary)",
              }}
            >
              v{revisionNumber}
            </span>
          </div>

          {/* Title */}
          <p
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              letterSpacing: -0.4,
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {name}
          </p>

          {/* Summary */}
          <p
            style={{
              fontSize: 13.5,
              color: "var(--color-text-muted)",
              marginTop: 8,
              lineHeight: 1.55,
              maxWidth: 520,
            }}
          >
            {summary}
          </p>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 24, marginTop: 18 }}>
            {(
              [
                [String(statsWorkoutsPerWeek), "workouts / week", "var(--color-metric-blue)"],
                [`${statsCompleted}`, "completed this week", "var(--color-metric-green)"],
                [String(statsActiveDays), "active days", "var(--color-metric-amber)"],
              ] as const
            ).map(([v, l, c]) => (
              <div key={l}>
                <p
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: c,
                    letterSpacing: -0.5,
                    fontVariantNumeric: "tabular-nums",
                    margin: 0,
                  }}
                >
                  {v}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1.1,
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                    marginTop: 5,
                  }}
                >
                  {l}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            width: 1,
            alignSelf: "stretch",
            background: "var(--color-border-default)",
          }}
          aria-hidden="true"
        />

        {/* Right: week mini-bars */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--color-text-muted)",
              marginBottom: 14,
              margin: "0 0 14px",
            }}
          >
            This week
          </p>
          <DsTrendStrip
            days={weekDays}
            maxH={64}
            ariaLabel="Weekly training completion by day"
          />
        </div>
      </div>
    </div>
  );
}

// ── TodaySession (exercise grid with video open callback) ──────────

type TodaySessionProps = {
  exercises: ExerciseCardData[];
  sessionTitle: string;
  onOpenExercise: (index: number) => void;
};

function TodaySession({ exercises, sessionTitle, onOpenExercise }: TodaySessionProps): ReactElement {
  const visible = exercises.slice(0, 4);
  const moreCount = Math.max(0, exercises.length - 4);

  return (
    <div
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 16,
        padding: 20,
      }}
      aria-label="Today's session"
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 4,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            background: "rgba(58,141,255,0.14)",
            color: "var(--color-metric-blue)",
          }}
        >
          Today
        </span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--color-text-primary)",
          }}
        >
          {sessionTitle}
        </span>
        <span
          style={{
            fontSize: 12.5,
            color: "var(--color-text-muted)",
            marginLeft: "auto",
          }}
        >
          {exercises.length} exercise{exercises.length !== 1 ? "s" : ""}
        </span>
      </div>

      <p
        style={{
          fontSize: 12.5,
          color: "var(--color-text-muted)",
          marginBottom: 16,
        }}
      >
        Review technique before your sets, then log your workout in Today.
      </p>

      {/* Exercise grid — 4 cols */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
        }}
      >
        {visible.map((ex, i) => (
          <MediaCard
            key={`${ex.title}-${i}`}
            kind="exercise"
            icon="dumbbell"
            color="var(--color-metric-blue)"
            title={ex.title}
            meta={ex.meta}
            duration={ex.duration}
            tags={ex.tags}
            poster={ex.poster}
            onOpen={() => onOpenExercise(i)}
          />
        ))}
      </div>

      {/* More hint + Today CTA */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginTop: 16,
          padding: "12px 15px",
          borderRadius: 12,
          background: "rgba(58,141,255,0.07)",
          border: "1px solid rgba(58,141,255,0.2)",
        }}
      >
        <Icon name="info" size={16} stroke="var(--color-metric-blue)" />
        <span style={{ flex: 1, fontSize: 13, color: "var(--color-text-secondary)" }}>
          {moreCount > 0
            ? `+${moreCount} more exercise${moreCount !== 1 ? "s" : ""} in this session`
            : "All exercises shown above"}
        </span>
        <Link
          href="/today"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 14px",
            borderRadius: 10,
            fontSize: 12.5,
            fontWeight: 600,
            background: "rgba(58,141,255,0.12)",
            border: "1px solid rgba(58,141,255,0.28)",
            color: "var(--color-metric-blue)",
            textDecoration: "none",
            whiteSpace: "nowrap",
            transition: "background 150ms ease",
          }}
        >
          <Icon name="today" size={14} stroke="var(--color-metric-blue)" />
          Mark in Today
        </Link>
      </div>
    </div>
  );
}

// ── WDayRow ───────────────────────────────────────────────────────

type WDayRowStatus = "done" | "today" | "plan" | "rest";

type WDayRowProps = {
  day: string;
  date: string;
  icon: Parameters<typeof Icon>[0]["name"];
  iconColor: string;
  title: string;
  meta?: string;
  status: WDayRowStatus;
  changed?: boolean;
  isToday?: boolean;
  isLast?: boolean;
};

const STATUS_LABEL: Record<WDayRowStatus, string> = {
  done: "Completed",
  today: "Today",
  plan: "Planned",
  rest: "Rest",
};

function WDayRow({
  day,
  date,
  icon,
  iconColor,
  title,
  meta,
  status,
  changed,
  isToday,
  isLast,
}: WDayRowProps): ReactElement {
  const statusColor: Record<WDayRowStatus, string> = {
    done: "var(--color-metric-green)",
    today: "var(--color-metric-blue)",
    plan: "var(--color-text-muted)",
    rest: "var(--color-text-muted)",
  };
  const chipBg: Record<WDayRowStatus, string> = {
    done: "rgba(25,195,125,0.14)",
    today: "rgba(58,141,255,0.14)",
    plan: "rgba(255,255,255,0.07)",
    rest: "rgba(255,255,255,0.05)",
  };
  const sc = statusColor[status];
  const bg = chipBg[status];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 15,
        padding: "13px 8px",
        borderBottom: isLast ? "none" : "1px solid var(--color-border-default)",
        background: isToday ? "rgba(58,141,255,0.05)" : "transparent",
        borderRadius: isToday ? 10 : 0,
      }}
    >
      {/* Day + date */}
      <div style={{ width: 48, flexShrink: 0, textAlign: "center" }}>
        <p
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: isToday ? "var(--color-metric-blue)" : "var(--color-text-primary)",
            margin: 0,
          }}
        >
          {day}
        </p>
        <p
          style={{
            fontSize: 11.5,
            color: "var(--color-text-muted)",
            marginTop: 2,
            margin: "2px 0 0",
          }}
        >
          {date}
        </p>
      </div>

      {/* Icon badge */}
      <div
        aria-hidden="true"
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            status === "rest"
              ? "rgba(255,255,255,0.04)"
              : `color-mix(in srgb, ${iconColor} 12%, transparent)`,
        }}
      >
        <Icon
          name={icon}
          size={17}
          stroke={status === "rest" ? "var(--color-text-muted)" : iconColor}
        />
      </div>

      {/* Title + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color:
                status === "rest"
                  ? "var(--color-text-muted)"
                  : "var(--color-text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </span>
          {changed ? (
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                background: "rgba(245,165,36,0.14)",
                color: "var(--color-metric-amber)",
              }}
            >
              changed
            </span>
          ) : null}
        </div>
        {meta ? (
          <p
            style={{
              fontSize: 12.5,
              color: "var(--color-text-muted)",
              marginTop: 3,
              margin: "3px 0 0",
            }}
          >
            {meta}
          </p>
        ) : null}
      </div>

      {/* Status chip */}
      <span
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          fontSize: 11.5,
          fontWeight: 600,
          background: bg,
          color: sc,
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexShrink: 0,
        }}
      >
        {status === "done" ? (
          <Icon name="checkSm" size={12} stroke="var(--color-metric-green)" sw={2.4} />
        ) : null}
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}

// ── WeekList ──────────────────────────────────────────────────────

type WeekListProps = {
  days: readonly WorkoutPlanDay[];
  sessions: readonly WorkoutSession[];
  todayIso: string;
};

const WEEKDAY_SHORT: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

function resolveSessionStatus(
  sessions: readonly WorkoutSession[],
  weekday: string,
  todayIso: string,
): WDayRowStatus {
  // Find session for this weekday pattern — use the most recent session matching this weekday
  // Since sessions don't directly embed weekday, look for sessions near today
  const daySession = sessions.find((s) => {
    const d = new Date(s.plannedDate);
    const dayName = d.toLocaleDateString("en", { weekday: "long" }).toLowerCase();
    return dayName === weekday;
  });

  if (!daySession) {
    return "plan";
  }

  if (daySession.status === "completed") return "done";
  if (daySession.plannedDate === todayIso) return "today";
  return "plan";
}

function WeekList({ days, sessions, todayIso }: WeekListProps): ReactElement {
  return (
    <div
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 16,
        padding: 16,
      }}
      aria-label="Weekly schedule"
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
          paddingBottom: 12,
          borderBottom: "1px solid var(--color-border-default)",
        }}
      >
        <IconBadge icon="today" color="var(--color-metric-blue)" size={28} />
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            flex: 1,
          }}
        >
          Week schedule
        </span>
      </div>

      {/* Day rows */}
      {days.map((day, i) => {
        const status = resolveSessionStatus(sessions, day.weekday, todayIso);
        const isToday = status === "today";
        const isRest = day.exercises.length === 0;
        const resolvedStatus: WDayRowStatus = isRest ? "rest" : status;

        // Build a readable date label based on weekday offset from today's week
        const todayDate = new Date(todayIso);
        const todayWeekday = todayDate.getDay();
        const weekdayIndex = [
          "sunday",
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
        ].indexOf(day.weekday);
        const diff = weekdayIndex - todayWeekday;
        const targetDate = new Date(todayDate);
        targetDate.setDate(todayDate.getDate() + diff);
        const dateLabel = targetDate.toLocaleDateString("en", {
          month: "short",
          day: "numeric",
        });

        return (
          <WDayRow
            key={getWorkoutPlanDayKey(day)}
            day={WEEKDAY_SHORT[day.weekday] ?? day.weekday}
            date={dateLabel}
            icon={isRest ? "moon" : "dumbbell"}
            iconColor="var(--color-metric-blue)"
            title={
              isRest ? "Rest" : getWorkoutPlanDayLabel(day) + (day.focus ? ` · ${day.focus}` : "")
            }
            meta={
              isRest
                ? "Recovery"
                : day.exercises.length > 0
                  ? `${day.exercises.length} exercise${day.exercises.length !== 1 ? "s" : ""}`
                  : undefined
            }
            status={resolvedStatus}
            isToday={isToday}
            isLast={i === days.length - 1}
          />
        );
      })}
    </div>
  );
}

// ── WeeklyProgress wrapper (wraps the full TrainingProgressPanel) ──

function WeeklyProgressSection(): ReactElement {
  return (
    <div
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 16,
        padding: 0,
        overflow: "hidden",
      }}
    >
      {/* Indigo adaptation pack teaser */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 13,
          padding: "14px 20px",
          borderBottom: "1px solid var(--color-border-default)",
          background: "rgba(123,123,255,0.04)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(123,123,255,0.16)",
          }}
        >
          <Icon name="spark" size={17} stroke="var(--color-metric-indigo)" />
        </div>
        <div style={{ flex: 1 }}>
          <p
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              margin: 0,
            }}
          >
            Adaptation pack ready to discuss
          </p>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--color-text-muted)",
              marginTop: 2,
              margin: "2px 0 0",
            }}
          >
            This turns into a chat proposal — the plan does not change here.
          </p>
        </div>
        <Link
          href="/chat"
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--color-metric-indigo)",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Preview →
        </Link>
      </div>

      {/* Full progress panel */}
      <TrainingProgressPanel />
    </div>
  );
}

// ── ExerciseTechniquePreview — honest media or catalog content panel ──
//
// Rules:
//  - When catalog media.refs contains an image ref → render <img>
//  - When catalog media.refs contains a video ref  → render <video controls>
//  - When refs are empty                           → show catalog details (instructions,
//    muscles, equipment, difficulty) via ExerciseCatalogDetails; show the
//    media.fallbackLabel only when NO useful catalog content exists either.
//  - No fake player chrome (no progress bar, no quality overlay, no hardcoded timestamps).

function resolveFirstMediaRef(
  media: ExerciseMedia | undefined,
): { kind: "image" | "video"; url: string; label?: string } | null {
  const refs = media?.refs ?? [];
  const renderable = refs.find((r) => r.url);
  if (!renderable?.url) return null;
  return { kind: renderable.kind, url: renderable.url, label: renderable.label };
}

type ExerciseVideoProps = {
  exercise: ExerciseCardData;
  exerciseIndex: number;
  totalExercises: number;
  allExercises: ExerciseCardData[];
  onBack: () => void;
  onSelectExercise: (index: number) => void;
};

function ExerciseVideo({
  exercise,
  exerciseIndex,
  totalExercises,
  allExercises,
  onBack,
  onSelectExercise,
}: ExerciseVideoProps): ReactElement {
  const strip = allExercises.slice(0, 5);
  const mediaRef = exercise.catalog
    ? resolveFirstMediaRef(exercise.catalog.media)
    : null;
  const fallbackLabel = exercise.catalog
    ? getExerciseMediaFallbackLabel(exercise.catalog)
    : "Demonstration coming soon";

  function handleBackKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onBack();
    }
  }

  return (
    <div style={{ padding: "20px 34px" }}>
      {/* Header: back + breadcrumb */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          onKeyDown={handleBackKey}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid var(--color-border-default)",
            borderRadius: 10,
            padding: "5px 12px",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            transition: "background 150ms ease",
          }}
          aria-label="Back to plan"
        >
          <span aria-hidden="true" style={{ display: "flex", transform: "rotate(180deg)" }}>
            <Icon name="chevR" size={15} stroke="var(--color-text-secondary)" />
          </span>
          Back to plan
        </button>
        <span
          style={{
            padding: "3px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 600,
            background: "rgba(255,255,255,0.07)",
            color: "var(--color-text-muted)",
          }}
        >
          Exercise {exerciseIndex + 1} of {totalExercises}
        </span>
      </div>

      {/* Two-pane layout */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* Left: technique preview area + filmstrip */}
        <div style={{ flex: "1.5 1 0", minWidth: 0 }}>
          {/* Media or honest placeholder */}
          <div
            style={{
              position: "relative",
              borderRadius: 18,
              overflow: "hidden",
              border: "1px solid var(--color-border-default)",
              background:
                "linear-gradient(135deg, var(--color-surface-elevated, #1c2733), #0c1114)",
              minHeight: 280,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {mediaRef?.kind === "video" ? (
              // Real video element with browser controls — no fake chrome
              <video
                src={mediaRef.url}
                controls
                aria-label={mediaRef.label ?? `Exercise demonstration: ${exercise.title}`}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : mediaRef?.kind === "image" ? (
              // Real image — using native img for externally hosted media URLs
              <img
                src={mediaRef.url}
                alt={mediaRef.label ?? `Exercise demonstration: ${exercise.title}`}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              // No media — technique preview placeholder (no play affordance)
              <div
                aria-label={`Technique preview: ${exercise.title}`}
                style={{
                  width: "100%",
                  padding: "48px 24px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 14,
                  textAlign: "center",
                }}
              >
                <span aria-hidden="true" style={{ display: "flex", opacity: 0.22 }}>
                  <Icon name="dumbbell" size={72} stroke="var(--color-metric-blue)" sw={1.2} />
                </span>
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--color-text-muted)",
                    margin: 0,
                    lineHeight: 1.5,
                    fontStyle: "italic",
                    maxWidth: 320,
                  }}
                >
                  Technique preview
                </p>
              </div>
            )}
          </div>

          {/* Filmstrip — exercise switcher */}
          <div
            style={{ display: "flex", gap: 10, marginTop: 14 }}
            role="list"
            aria-label="Exercise filmstrip"
          >
            {strip.map((ex, i) => (
              <button
                key={`filmstrip-${i}`}
                type="button"
                role="listitem"
                onClick={() => onSelectExercise(i)}
                style={{
                  flex: 1,
                  borderRadius: 11,
                  overflow: "hidden",
                  cursor: "pointer",
                  border: `1px solid ${i === exerciseIndex ? "var(--color-metric-blue)" : "var(--color-border-default)"}`,
                  opacity: i === exerciseIndex ? 1 : 0.7,
                  background: "transparent",
                  padding: 0,
                  transition: "opacity 150ms ease, border-color 150ms ease",
                }}
                aria-label={`Switch to ${ex.title}`}
                aria-pressed={i === exerciseIndex}
              >
                <div
                  style={{
                    height: 52,
                    background: "linear-gradient(135deg, #1c2733, #0f1518)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span aria-hidden="true" style={{ display: "flex", opacity: 0.5 }}>
                    <Icon name="dumbbell" size={20} stroke="var(--color-metric-blue)" />
                  </span>
                </div>
                <p
                  style={{
                    padding: "7px 9px",
                    fontSize: 11,
                    color: "var(--color-text-muted)",
                    margin: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {ex.title}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Right: exercise detail card */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              background: "var(--color-surface-card)",
              border: "1px solid var(--color-border-default)",
              borderRadius: 16,
              padding: 20,
            }}
          >
            <p
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--color-text-primary)",
                letterSpacing: -0.4,
                margin: 0,
              }}
            >
              {exercise.title}
            </p>

            {/* Chips: sets/reps + tags */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 12,
                flexWrap: "wrap",
              }}
            >
              {exercise.meta ? (
                <span
                  style={{
                    padding: "4px 11px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    background: "rgba(58,141,255,0.14)",
                    color: "var(--color-metric-blue)",
                  }}
                >
                  {exercise.meta}
                </span>
              ) : null}
              {exercise.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: "4px 11px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    background: "rgba(255,255,255,0.07)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Divider */}
            <div
              style={{
                height: 1,
                background: "var(--color-border-default)",
                margin: "18px 0",
              }}
            />

            {/* Technique guidance — real catalog content when available */}
            {exercise.catalog ? (
              <ExerciseCatalogDetails
                catalog={exercise.catalog}
                className="technique-preview-catalog"
              />
            ) : (
              /* Total fallback: no catalog at all */
              <p
                style={{
                  fontSize: 12,
                  color: "var(--color-text-muted)",
                  margin: 0,
                  lineHeight: 1.5,
                  fontStyle: "italic",
                }}
              >
                {fallbackLabel ?? "Demonstration coming soon"}
              </p>
            )}
          </div>

          {/* Ready to do it? card */}
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 13,
              background: "rgba(25,195,125,0.07)",
              border: "1px solid rgba(25,195,125,0.25)",
              borderRadius: 16,
              padding: 16,
            }}
          >
            <Icon name="today" size={20} stroke="var(--color-metric-green)" />
            <div style={{ flex: 1 }}>
              <p
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: 0,
                }}
              >
                Ready to do it?
              </p>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--color-text-muted)",
                  marginTop: 2,
                  margin: "2px 0 0",
                }}
              >
                Log your sets on the Today screen.
              </p>
            </div>
            <Link
              href="/today"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 14px",
                borderRadius: 10,
                fontSize: 12.5,
                fontWeight: 600,
                background: "rgba(25,195,125,0.12)",
                border: "1px solid rgba(25,195,125,0.28)",
                color: "var(--color-metric-green)",
                textDecoration: "none",
                whiteSpace: "nowrap",
                transition: "background 150ms ease",
              }}
            >
              Go to Today
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Layout wrapper ─────────────────────────────────────────────────

function TrainingScreenLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: "20px 34px",
      }}
    >
      {children}
    </div>
  );
}

// ── Helper: derive today's session exercises from plan payload ─────

function deriveTodayExercises(
  days: readonly WorkoutPlanDay[],
  todayIso: string,
): { title: string; exercises: ExerciseCardData[] } | null {
  const todayDate = new Date(todayIso);
  const weekdayName = todayDate
    .toLocaleDateString("en", { weekday: "long" })
    .toLowerCase();
  const todayDay = days.find((d) => d.weekday === weekdayName);
  if (!todayDay || todayDay.exercises.length === 0) return null;

  const exercises: ExerciseCardData[] = todayDay.exercises.slice(0, 6).map((ex, i) => {
    // Resolve name from structured (snapshot.name) or legacy (name) forms
    const name =
      "snapshot" in ex
        ? (ex as { snapshot: { name: string } }).snapshot.name
        : "name" in ex
          ? (ex as { name: string }).name
          : `Exercise ${i + 1}`;

    const meta =
      "sets" in ex && ex.sets && "reps" in ex && ex.reps
        ? `${ex.sets}×${ex.reps}`
        : "sets" in ex && ex.sets
          ? `${ex.sets} sets`
          : "";

    // Thread catalog metadata — structured exercises have catalog on them via
    // resolvePlanExerciseCatalogMetadata; legacy exercises return null.
    const catalog = resolvePlanExerciseCatalogMetadata(ex);

    return {
      title: name,
      meta,
      tags: [],
      poster: i,
      catalog,
    };
  });

  const sessionTitle = `${getWorkoutPlanDayLabel(todayDay)} · ${todayDay.focus}`;
  return { title: sessionTitle, exercises };
}

// ── Build revision history rows ────────────────────────────────────

function buildRevisionHistoryRows(
  revisions: readonly WorkoutPlanRevision[],
  activeRevisionId: string,
): RevisionHistoryRow[] {
  const sorted = [...revisions].sort((a, b) => b.revisionNumber - a.revisionNumber);
  return sorted.map((r, index) => {
    // The previous entry in the sorted array has the next-lower revisionNumber
    const previousRevision = sorted[index + 1];
    const reason = formatRevisionReason(r.reason, previousRevision?.reason, r.revisionNumber);
    const note = reason.length > 90 ? `${reason.slice(0, 90)}…` : reason;
    return {
      rev: `v${r.revisionNumber}`,
      when: formatPlanRevisionTimestamp(r.createdAt),
      note,
      active: r.id === activeRevisionId,
    };
  });
}

// ── Main export: TrainingWorkspace ────────────────────────────────

export function TrainingWorkspace() {
  const { getToken } = useAuth();
  const [selectedExerciseIndex, setSelectedExerciseIndex] = useState<number | null>(null);

  const activePlanQuery = useQuery({
    queryKey: apiQueryKeys.workoutActive,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getActiveWorkoutPlan(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? { plan: null, activeRevision: null, sessions: [] };
    },
  });

  const revisionsQuery = useQuery({
    queryKey: apiQueryKeys.workoutRevisions,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listWorkoutRevisions(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? [];
    },
  });

  // ── Loading state ──────────────────────────────────────────────
  if (activePlanQuery.isLoading || revisionsQuery.isLoading) {
    return <LoadingScreen label="Loading your training plan" layout="plan" />;
  }

  // ── Error state ────────────────────────────────────────────────
  if (activePlanQuery.isError || revisionsQuery.isError) {
    return (
      <ErrorState
        title="Workout plan unavailable"
        description="Your active workout plan could not be loaded. Try refreshing — your data is safe."
        action={
          <Link
            href="/chat"
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: "var(--color-metric-blue)",
              textDecoration: "none",
            }}
          >
            Open Chat →
          </Link>
        }
      />
    );
  }

  const active = activePlanQuery.data;
  const activeRevision = active?.activeRevision ?? null;
  const payload = activeRevision?.payload ?? null;
  const revisions = revisionsQuery.data ?? [];
  const sessions = active?.sessions ?? [];
  const showPlan = active ? hasActiveWorkoutPlan(active) : false;
  const todayIso = formatLocalIsoDate(new Date());
  const weekStrip = buildTrainingWeekStripView(sessions);

  // ── Empty state ────────────────────────────────────────────────
  if (!showPlan || !activeRevision || !payload) {
    return (
      <TrainingScreenLayout>
        <ChangeBanner />
        <ActivePlanHeader empty />
        <WeeklyProgressSection />
      </TrainingScreenLayout>
    );
  }

  // ── Derive data for done state ─────────────────────────────────
  const todaySession = deriveTodayExercises(payload.days, todayIso);
  const historyRows = buildRevisionHistoryRows(revisions, activeRevision.id);
  // Derive today's Monday-based day index (0=Mon…6=Sun) for future/today bar states.
  const _trainingTodayJsDay = new Date().getDay();
  const _trainingTodayWeekIdx = _trainingTodayJsDay === 0 ? 6 : _trainingTodayJsDay - 1;
  const weekDays = weekStrip.dayLabels.map((label, i) => ({
    label,
    value: weekStrip.trend[i] ?? 0,
    state: i > _trainingTodayWeekIdx
      ? ("future" as const)
      : i === _trainingTodayWeekIdx
        ? ("today" as const)
        : ("past" as const),
  }));
  // Week-scoped stats via canonical aggregateWorkoutWeek
  const _nowDate = new Date();
  const _weekday = _nowDate.getDay();
  const _weekOffset = _weekday === 0 ? -6 : 1 - _weekday;
  const _weekStartDate = new Date(_nowDate);
  _weekStartDate.setDate(_nowDate.getDate() + _weekOffset);
  _weekStartDate.setHours(0, 0, 0, 0);
  const _weekEndDate = new Date(_weekStartDate);
  _weekEndDate.setDate(_weekStartDate.getDate() + 6);
  const weekStats = aggregateWorkoutWeek(
    sessions,
    formatLocalIsoDate(_weekStartDate),
    formatLocalIsoDate(_weekEndDate),
  );
  const completedCount = weekStats.plannedCompletedCount;
  const workoutsPerWeek = payload.days.filter((d) => d.exercises.length > 0).length;

  // ── Video state ────────────────────────────────────────────────
  if (selectedExerciseIndex !== null && todaySession) {
    const exercise = todaySession.exercises[selectedExerciseIndex];
    if (exercise) {
      return (
        <ExerciseVideo
          exercise={exercise}
          exerciseIndex={selectedExerciseIndex}
          totalExercises={todaySession.exercises.length}
          allExercises={todaySession.exercises}
          onBack={() => setSelectedExerciseIndex(null)}
          onSelectExercise={(i) => setSelectedExerciseIndex(i)}
        />
      );
    }
  }

  // ── Done state ─────────────────────────────────────────────────
  return (
    <TrainingScreenLayout>
      {/* 1. ChangeBanner */}
      <ChangeBanner />

      {/* 2. ActivePlanHeader */}
      <ActivePlanHeader
        name={payload.title}
        summary={payload.summary}
        revisionNumber={activeRevision.revisionNumber}
        weekDays={weekDays}
        statsWorkoutsPerWeek={workoutsPerWeek}
        statsCompleted={completedCount}
        statsActiveDays={weekStats.activeDays}
      />

      {/* 3. DailyExecCard */}
      <DailyExecCard
        icon="today"
        color="blue"
        title="Execution happens on Today"
        text="Start and log each workout from Today. This screen is read-only."
        cta="Open Today"
        todayHref="/today"
      />

      {/* 4. RevisionFacts */}
      <RevisionFacts
        rev={`v${activeRevision.revisionNumber}`}
        when={formatPlanRevisionTimestamp(activeRevision.createdAt)}
        source={formatPlanRevisionSource(activeRevision.source)}
        why={activeRevision.reason}
        accent="var(--color-metric-blue)"
      />

      {/* 5. TodaySession */}
      {todaySession ? (
        <TodaySession
          exercises={todaySession.exercises}
          sessionTitle={todaySession.title}
          onOpenExercise={(i) => setSelectedExerciseIndex(i)}
        />
      ) : null}

      {/* 6. CoachNotes */}
      {payload.notes.length > 0 ? (
        <CoachNotes>{payload.notes.join(" ")}</CoachNotes>
      ) : null}

      {/* 7. WeekList */}
      <WeekList days={payload.days} sessions={sessions} todayIso={todayIso} />

      {/* 8. RevisionHistoryDark */}
      <RevisionHistoryDark
        rows={historyRows}
        defaultOpen={true}
        footerNote="Past workouts stay tied to the revision that was active when you logged them."
      />

      {/* 9. WeeklyProgress */}
      <WeeklyProgressSection />
    </TrainingScreenLayout>
  );
}
