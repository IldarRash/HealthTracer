"use client";

import { useAuth } from "@clerk/nextjs";
import type {
  TodayDailyFeedback,
  WellbeingCrisisEvaluation,
  WellbeingScore,
} from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  apiQueryKeys,
  getRecoveryContext,
  getTodayDay,
  getWellbeingCheckIn,
  getTodayItemStatusRefreshQueryKeys,
  getNutritionAdherenceRefreshQueryKeys,
  getWellbeingRefreshQueryKeys,
  upsertWellbeingCheckIn,
  upsertNutritionAdherence,
  updateTodayFeedback,
  updateTodayItemStatus,
  startTodayWorkout,
} from "../../lib/api";
import type { TodayWorkoutDetail } from "@health/types";
import {
  formatLocalIsoDate,
  isTodayHabitItem,
  canUpdateTodayItem,
  formatTaskCountChip,
} from "../../lib/today-ui-state";
import {
  buildTodayNutritionAdherenceView,
  resolveTodayNutritionCardPhase,
  todayNutritionPayload,
} from "../../lib/today-nutrition-ui-state";
import { toggleMealCompletion } from "../../lib/nutrition-ui-state";
import {
  buildWellbeingCheckInPayload,
  canSubmitWellbeingCheckIn,
  resolveWellbeingCrisisPreview,
  resolveWellbeingCrisisDisplay,
  shouldRenderWellbeingCrisisInCard,
  resolveWellbeingCrisisForParent,
} from "../../lib/wellbeing-ui-state";
import { buildRecoveryFocusView } from "../../lib/recovery-ui-state";
import {
  hydrationSegments,
  hydrationLabel,
  WATER_SEGMENT_COUNT,
} from "../../lib/hydration-segments";
import { canStartTodayWorkout } from "../../lib/today-ui-state";
import { formatWeekdayLong, formatMonthShort } from "../../lib/date-format";
import { Icon } from "../ui/icon";
import { CheckCircle } from "../ui/check-circle";
import { SegmentRow } from "../ui/segment-row";
import { MoodDotScale } from "./mood-dot-scale";
import { CrisisSupportPanel } from "../wellbeing/crisis-support-panel";

// ── Token palette (inline – dark WHOOP world) ───────────────────
const D = {
  bg: "#0b0d0e",
  panel: "#131618",
  panel2: "#1a1e21",
  line: "rgba(255,255,255,0.075)",
  line2: "rgba(255,255,255,0.14)",
  ink: "#f3f5f6",
  ink2: "#cfd4d7",
  mut: "#878d92",
  mut2: "#5e656a",
} as const;

const M = {
  green: "#19c37d",
  greenDim: "rgba(25,195,125,0.16)",
  amber: "#f5a524",
  amberDim: "rgba(245,165,36,0.16)",
  red: "#f0506a",
  redDim: "rgba(240,80,106,0.16)",
  blue: "#3a8dff",
  blueDim: "rgba(58,141,255,0.16)",
  indigo: "#7b7bff",
  indigoDim: "rgba(123,123,255,0.16)",
} as const;

// ── Tiny shared atoms (local only) ──────────────────────────────

function DarkCard({
  children,
  style,
  accent,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  accent?: string;
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 18,
        background: D.panel,
        border: `1px solid ${D.line}`,
        borderTop: accent ? `2px solid ${accent}` : `1px solid ${D.line}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHead({
  icon,
  color,
  title,
  right,
}: {
  icon?: React.ComponentProps<typeof Icon>["name"];
  color: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        marginBottom: 14,
      }}
    >
      {icon ? (
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${color}22`,
          }}
        >
          <Icon name={icon} size={15} stroke={color} />
        </div>
      ) : null}
      <span
        style={{
          fontSize: 13.5,
          fontWeight: 700,
          letterSpacing: 0.2,
          color: D.ink,
          flex: 1,
        }}
      >
        {title}
      </span>
      {right}
    </div>
  );
}

function Eyebrow({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color,
      }}
    >
      {children}
    </div>
  );
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "amber" }) {
  const tones = {
    neutral: { bg: "rgba(255,255,255,0.06)", fg: D.ink2, bd: D.line },
    green: { bg: M.greenDim, fg: M.green, bd: "transparent" },
    amber: { bg: M.amberDim, fg: M.amber, bd: "transparent" },
  };
  const c = tones[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.bd}`,
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function ExerciseChip({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: "5px 10px",
        borderRadius: 8,
        background: M.blueDim,
        color: M.blue,
        fontSize: 12.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function QuickLinkRow({
  icon,
  label,
  href,
  border,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  label: string;
  href: string;
  border?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 12px",
        borderBottom: border ? `1px solid ${D.line}` : "none",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <Icon name={icon} size={18} stroke={D.mut} />
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: D.ink2 }}>{label}</span>
      <Icon name="chevR" size={15} stroke={D.mut2} />
    </Link>
  );
}

// ── Date formatting ──────────────────────────────────────────────

function formatTopBarDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const d = new Date(year, month - 1, day);
  const weekday = formatWeekdayLong(d);
  const monthLabel = formatMonthShort(d);
  return `${weekday} · ${monthLabel} ${day}`;
}

// ── Day strip (qualitative band + focus hint, no numeric donuts) ─

function DayStrip({
  band,
  focusMessage,
  isLoading,
}: {
  band?: string | null;
  focusMessage?: string | null;
  isLoading: boolean;
}) {
  const bandColors: Record<string, string> = {
    well_supported: M.green,
    moderate_load: M.amber,
    prioritize_recovery: M.amber,
    insufficient_data: D.mut,
  };
  const bandLabels: Record<string, string> = {
    well_supported: "Solid recovery support",
    moderate_load: "Moderate load",
    prioritize_recovery: "Prioritize recovery",
    insufficient_data: "Building picture",
  };

  const bandColor = band ? (bandColors[band] ?? D.mut) : D.mut;
  const bandLabel = band ? (bandLabels[band] ?? band) : null;
  const hint = focusMessage ?? "Log check-ins to build your daily recovery picture.";

  return (
    <DarkCard style={{ marginBottom: 16 }}>
      {bandLabel ? (
        <div style={{ marginBottom: 12 }}>
          <span
            data-testid="recovery-band-chip"
            style={{
              display: "inline-block",
              padding: "4px 12px",
              borderRadius: 999,
              background: `${bandColor}22`,
              color: bandColor,
              fontSize: 12.5,
              fontWeight: 600,
              letterSpacing: 0.2,
            }}
          >
            {bandLabel}
          </span>
        </div>
      ) : isLoading ? (
        <div
          style={{
            height: 24,
            width: 140,
            borderRadius: 999,
            background: "rgba(255,255,255,0.06)",
            marginBottom: 12,
          }}
        />
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 9,
          paddingTop: bandLabel ? 12 : 0,
          borderTop: bandLabel ? `1px solid ${D.line}` : "none",
        }}
      >
        <span style={{ marginTop: 1, flexShrink: 0, display: "flex" }}>
          <Icon name="info" size={15} stroke={D.mut} />
        </span>
        <span
          data-testid="recovery-focus-hint"
          style={{ fontSize: 13, color: D.ink2, lineHeight: 1.4 }}
        >
          {hint}
        </span>
      </div>
    </DarkCard>
  );
}

// ── Movement card ───────────────────────────────────────────────

type WorkoutCardProps = {
  workout: TodayWorkoutDetail | null;
  workoutItemDone: boolean;
  workoutItemId: string | null;
  isBusy: boolean;
  onMarkDone: (itemId: string) => void;
  selectedDate: string;
};

function MoveCard({
  workout,
  workoutItemDone,
  workoutItemId,
  isBusy,
  onMarkDone,
  selectedDate,
}: WorkoutCardProps) {
  const { getToken } = useAuth();
  const [starting, setStarting] = useState(false);

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const token = await getToken();
      if (token && workout?.sessionId != null) {
        await startTodayWorkout(token, selectedDate);
      }
    } catch {
      // swallow — not blocking for the card
    } finally {
      setStarting(false);
    }
  };

  if (!workout) {
    return (
      <DarkCard style={{ marginBottom: 16 }}>
        <CardHead icon="dumbbell" color={M.blue} title="Movement" />
        <p style={{ fontSize: 13, color: D.mut, lineHeight: 1.55 }}>
          No workout scheduled today.{" "}
          <Link href="/training" style={{ color: M.blue, fontWeight: 600 }}>
            Open Workouts
          </Link>{" "}
          or{" "}
          <Link href="/chat" style={{ color: M.blue, fontWeight: 600 }}>
            ask the coach.
          </Link>
        </p>
      </DarkCard>
    );
  }

  if (workout.isRestDay) {
    return (
      <DarkCard style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 11,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: M.blueDim,
            }}
          >
            <Icon name="dumbbell" size={21} stroke={M.blue} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Eyebrow color={M.blue}>Movement · Rest day</Eyebrow>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.2, color: D.ink, margin: "7px 0 3px" }}>
              {workout.title}
            </div>
            <div style={{ fontSize: 13, color: D.mut }}>Rest and recovery scheduled.</div>
          </div>
        </div>
      </DarkCard>
    );
  }

  const exerciseLabels = workout.exercises.slice(0, 4).map((ex) => {
    const parts = [ex.prescription.snapshot.name];
    if (ex.prescription.sets && ex.prescription.reps) {
      parts.push(`${ex.prescription.sets}×${ex.prescription.reps}`);
    }
    return parts.join(" · ");
  });

  const canMarkDone = !workoutItemDone && workoutItemId && !isBusy;
  const showStartButton =
    workout.status === "planned" &&
    canStartTodayWorkout(workout);

  return (
    <DarkCard style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: M.blueDim,
          }}
        >
          <Icon name="dumbbell" size={21} stroke={M.blue} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Eyebrow color={M.blue}>Movement</Eyebrow>
            {workoutItemId ? (
              <CheckCircle done={workoutItemDone} color={M.blue} size={22} />
            ) : null}
          </div>

          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: -0.2,
              color: D.ink,
              margin: "7px 0 3px",
            }}
          >
            {workout.title}
          </div>

          {workout.focus ? (
            <div style={{ fontSize: 13, color: D.mut, marginBottom: exerciseLabels.length ? 13 : 0 }}>
              {workout.focus}
            </div>
          ) : null}

          {exerciseLabels.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
              {exerciseLabels.map((label) => (
                <ExerciseChip key={label} label={label} />
              ))}
              {workout.exercises.length > 4 ? (
                <ExerciseChip label={`+${workout.exercises.length - 4} more`} />
              ) : null}
            </div>
          ) : null}

          {showStartButton && !workoutItemDone ? (
            <div style={{ marginBottom: 10 }}>
              <button
                type="button"
                disabled={starting || isBusy}
                onClick={handleStart}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  background: M.blue,
                  color: "#fff",
                  border: "none",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: starting || isBusy ? "not-allowed" : "pointer",
                  opacity: starting || isBusy ? 0.7 : 1,
                }}
              >
                {starting ? "Starting…" : "Start workout"}
              </button>
            </div>
          ) : null}

          {canMarkDone && !showStartButton ? (
            <div style={{ marginBottom: 10 }}>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onMarkDone(workoutItemId!)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  background: M.blueDim,
                  color: M.blue,
                  border: `1px solid ${M.blue}44`,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: isBusy ? "not-allowed" : "pointer",
                }}
              >
                Mark done
              </button>
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 4,
              color: D.ink2,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Link href="/training" style={{ color: D.ink2, textDecoration: "none" }}>
              Open workout plan
            </Link>
            <Icon name="chevR" size={14} stroke={D.mut} />
          </div>
        </div>
      </div>
    </DarkCard>
  );
}

// ── Nutrition + water card ───────────────────────────────────────

type FoodCardProps = {
  nutrition: import("@health/types").TodayNutritionDetail | null;
  selectedDate: string;
  isBusy: boolean;
  onRefresh: () => void;
};

function FoodCard({ nutrition, selectedDate, isBusy, onRefresh }: FoodCardProps) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const phase = resolveTodayNutritionCardPhase(nutrition);
  const adherenceState = nutrition ? buildTodayNutritionAdherenceView(nutrition) : null;
  const payload = nutrition ? todayNutritionPayload(nutrition) : null;

  const adherenceMutation = useMutation({
    mutationFn: async (input: Partial<import("@health/types").NutritionAdherenceState>) => {
      if (!adherenceState) throw new Error("Nutrition adherence is unavailable.");
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");
      const result = await upsertNutritionAdherence(token, selectedDate, {
        hydrationLitersConsumed:
          input.hydrationLitersConsumed ?? adherenceState.hydrationLitersConsumed,
        mealCompletion: input.mealCompletion ?? adherenceState.mealCompletion,
        targetCompletion: input.targetCompletion ?? adherenceState.targetCompletion,
        notes: input.notes ?? adherenceState.notes,
      });
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Nutrition adherence could not be saved.");
      }
      return result.data;
    },
    onSuccess: () => {
      for (const queryKey of getNutritionAdherenceRefreshQueryKeys()) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onRefresh();
    },
  });

  const cardBusy = isBusy || adherenceMutation.isPending;

  const saveAdherence = (next: Partial<import("@health/types").NutritionAdherenceState>) => {
    if (cardBusy || !adherenceState) return;
    adherenceMutation.mutate(next);
  };

  const consumed = adherenceState?.hydrationLitersConsumed ?? null;
  const target = payload?.hydrationLiters ?? null;
  const waterFilled = hydrationSegments(consumed, target);
  const waterLabel = target ? hydrationLabel(consumed, target) : null;

  return (
    <DarkCard style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: M.greenDim,
          }}
        >
          <Icon name="fork" size={21} stroke={M.green} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow color={M.green}>Nutrition today</Eyebrow>

          {phase === "empty" ? (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 13, color: D.mut, lineHeight: 1.55 }}>
                No active nutrition plan.{" "}
                <Link href="/chat" style={{ color: M.green, fontWeight: 600 }}>
                  Ask the coach
                </Link>{" "}
                to create one.
              </p>
            </div>
          ) : (
            <>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: -0.2,
                  color: D.ink,
                  margin: "7px 0 3px",
                }}
              >
                {payload?.title ?? "Nutrition"}
              </div>

              {payload?.summary ? (
                <div style={{ fontSize: 13, color: D.mut, marginBottom: 12 }}>
                  {payload.summary}
                </div>
              ) : null}

              {adherenceState && adherenceState.mealCompletion.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 14 }}>
                  {adherenceState.mealCompletion.map((meal) => (
                    <button
                      key={meal.label}
                      type="button"
                      disabled={cardBusy}
                      onClick={() =>
                        saveAdherence({
                          mealCompletion: toggleMealCompletion(
                            adherenceState.mealCompletion,
                            meal.label,
                          ),
                        })
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: cardBusy ? "not-allowed" : "pointer",
                        textAlign: "left",
                      }}
                    >
                      <CheckCircle done={meal.completed} color={M.green} size={18} />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: D.mut2,
                          width: 64,
                          letterSpacing: 0.3,
                          textTransform: "uppercase",
                          flexShrink: 0,
                        }}
                      >
                        {meal.label}
                      </span>
                      <span
                        style={{
                          fontSize: 13.5,
                          color: meal.completed ? D.mut : D.ink2,
                          textDecoration: meal.completed ? "line-through" : "none",
                        }}
                      >
                        {meal.completed ? "Done" : "Not logged"}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {target != null ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    paddingTop: 14,
                    borderTop: `1px solid ${D.line}`,
                  }}
                >
                  <Icon name="drop" size={17} stroke={M.blue} />
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: D.ink2,
                      letterSpacing: 0.3,
                      textTransform: "uppercase",
                      flexShrink: 0,
                    }}
                  >
                    Water
                  </span>
                  <div style={{ flex: 1 }}>
                    <SegmentRow
                      filled={waterFilled}
                      total={WATER_SEGMENT_COUNT}
                      color={M.blue}
                      countLabel={waterLabel ?? undefined}
                    />
                  </div>
                </div>
              ) : null}

              {adherenceMutation.isError ? (
                <p
                  style={{ color: "#f0506a", fontSize: 12, marginTop: 8 }}
                  role="alert"
                >
                  {adherenceMutation.error instanceof Error
                    ? adherenceMutation.error.message
                    : "Could not save."}
                </p>
              ) : null}
            </>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 14,
              color: D.ink2,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Link href="/nutrition" style={{ color: D.ink2, textDecoration: "none" }}>
              Open nutrition plan
            </Link>
            <Icon name="chevR" size={14} stroke={D.mut} />
          </div>
        </div>
      </div>
    </DarkCard>
  );
}

// ── Habits card ─────────────────────────────────────────────────

type HabitsCardProps = {
  items: import("@health/types").TodayChecklistItem[];
  isBusy: boolean;
  onMark: (itemId: string, status: "completed" | "skipped") => void;
  updatingItemId: string | null;
};

function HabitsCard({ items, isBusy, onMark, updatingItemId }: HabitsCardProps) {
  const habitItems = items.filter(isTodayHabitItem);
  const done = habitItems.filter((i) => i.status === "completed").length;
  const total = habitItems.length;

  return (
    <DarkCard>
      <CardHead
        icon="spark"
        color={M.indigo}
        title="Habits today"
        right={
          total > 0 ? (
            <Chip>
              {done} / {total}
            </Chip>
          ) : null
        }
      />

      {habitItems.length === 0 ? (
        <p style={{ fontSize: 13, color: D.mut, lineHeight: 1.55 }}>
          No habits scheduled.{" "}
          <Link href="/chat" style={{ color: M.indigo, fontWeight: 600 }}>
            Ask the coach
          </Link>{" "}
          to build a habit plan.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {habitItems.map((item) => {
            const isDone = item.status === "completed";
            const isUpdating = updatingItemId === item.id && isBusy;
            const canUpdate = canUpdateTodayItem(item);

            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 8px",
                  borderRadius: 10,
                  background: isDone ? "rgba(255,255,255,0.03)" : "transparent",
                }}
              >
                <button
                  type="button"
                  disabled={!canUpdate || isBusy}
                  onClick={() => canUpdate && onMark(item.id, "completed")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: canUpdate && !isBusy ? "pointer" : "default",
                    flexShrink: 0,
                  }}
                  aria-label={isDone ? "Habit complete" : "Mark habit complete"}
                >
                  <CheckCircle done={isDone} color={M.indigo} size={22} />
                </button>
                <span
                  style={{
                    fontSize: 14,
                    color: isDone ? D.mut : D.ink,
                    textDecoration: isDone ? "line-through" : "none",
                    flex: 1,
                  }}
                >
                  {isUpdating ? "Saving…" : item.label}
                </span>
                {canUpdate && !isDone ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onMark(item.id, "skipped")}
                    style={{
                      background: "none",
                      border: "none",
                      fontSize: 11,
                      color: D.mut2,
                      cursor: isBusy ? "not-allowed" : "pointer",
                      padding: "2px 6px",
                    }}
                  >
                    Skip
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </DarkCard>
  );
}

// ── Wellbeing check-in card (reskinned with MoodDotScale) ────────

type CheckinCardProps = {
  selectedDate: string;
  onCrisisSupportChange?: (ev: WellbeingCrisisEvaluation | null) => void;
};

function CheckinCard({ selectedDate, onCrisisSupportChange }: CheckinCardProps) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [moodScore, setMoodScore] = useState<WellbeingScore | null>(null);
  const [stressScore, setStressScore] = useState<WellbeingScore | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [serverCrisis, setServerCrisis] = useState<WellbeingCrisisEvaluation | null>(null);

  const checkInQuery = useQuery({
    queryKey: apiQueryKeys.wellbeingCheckIn(selectedDate),
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");
      const result = await getWellbeingCheckIn(token, selectedDate);
      if (result.error) throw new Error(result.error);
      return result.data?.checkIn ?? null;
    },
  });

  const existingCheckIn = checkInQuery.data ?? null;

  useEffect(() => {
    setMoodScore(existingCheckIn?.moodScore ?? null);
    setStressScore(existingCheckIn?.stressScore ?? null);
    setIsEditing(existingCheckIn == null);
    setServerCrisis(null);
  }, [existingCheckIn, selectedDate]);

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (moodScore == null || stressScore == null) {
        throw new Error("Select mood and stress before saving.");
      }
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");
      const payload = buildWellbeingCheckInPayload({ moodScore, stressScore, note: "" });
      const result = await upsertWellbeingCheckIn(token, selectedDate, payload);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Check-in could not be saved.");
      }
      return result.data;
    },
    onSuccess: (data) => {
      setServerCrisis(data.crisisSupport);
      setIsEditing(false);
      for (const queryKey of getWellbeingRefreshQueryKeys()) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  const crisisPreview = resolveWellbeingCrisisPreview({ moodScore, note: "" });
  const crisisDisplay = resolveWellbeingCrisisDisplay(crisisPreview, serverCrisis);
  const showCrisisInCard = shouldRenderWellbeingCrisisInCard({
    crisisDisplay,
    delegateToParent: onCrisisSupportChange != null,
  });

  useEffect(() => {
    if (!onCrisisSupportChange) return;
    onCrisisSupportChange(
      resolveWellbeingCrisisForParent({
        preview: crisisPreview,
        serverCrisisSupport: serverCrisis,
        persistedCheckIn: existingCheckIn,
      }),
    );
  }, [existingCheckIn, moodScore, onCrisisSupportChange, serverCrisis, crisisPreview]);

  const canSave = canSubmitWellbeingCheckIn({
    moodScore,
    stressScore,
    note: "",
    existingCheckIn,
  });
  const isBusy = upsertMutation.isPending || checkInQuery.isFetching;

  // Stress: map WellbeingScore 1-5 → 3 segments [Low, Moderate, High]
  // Low=1-2, Moderate=3, High=4-5
  // Display-only mapping; writes still use the 1-5 scale
  const STRESS_SEGMENTS = ["Low", "Moderate", "High"] as const;
  const stressSegmentIndex =
    stressScore == null
      ? -1
      : stressScore <= 2
        ? 0
        : stressScore === 3
          ? 1
          : 2;

  const handleStressSelect = (idx: number) => {
    // Map back to score: Low→2, Moderate→3, High→4
    const scoreMap: Record<number, WellbeingScore> = { 0: 2, 1: 3, 2: 4 };
    setStressScore(scoreMap[idx] ?? null);
  };

  return (
    <DarkCard accent={M.amber} style={{ marginBottom: 16 }}>
      <CardHead icon="heart" color={M.amber} title="Wellbeing check-in" />

      {showCrisisInCard && crisisDisplay.copy ? (
        <CrisisSupportPanel copy={crisisDisplay.copy} />
      ) : null}

      {existingCheckIn && !isEditing ? (
        <div>
          <p style={{ fontSize: 13, color: D.mut, marginBottom: 12 }}>Check-in saved.</p>

          {/* Show mood dots read-only */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: D.mut2,
                marginBottom: 9,
              }}
            >
              Mood
            </div>
            <MoodDotScale value={existingCheckIn.moodScore} onChange={() => {}} disabled />
          </div>

          {/* Show stress segments read-only */}
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: D.mut2,
                marginBottom: 9,
              }}
            >
              Stress
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              {STRESS_SEGMENTS.map((label, i) => {
                const savedSegmentIdx =
                  existingCheckIn.stressScore <= 2
                    ? 0
                    : existingCheckIn.stressScore === 3
                      ? 1
                      : 2;
                const isActive = i === savedSegmentIdx;
                return (
                  <div
                    key={label}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "9px 0",
                      borderRadius: 10,
                      fontSize: 12.5,
                      fontWeight: 600,
                      background: isActive ? M.greenDim : "rgba(255,255,255,0.03)",
                      color: isActive ? M.green : D.mut,
                      border: `1px solid ${isActive ? "transparent" : D.line}`,
                    }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => setIsEditing(true)}
            style={{
              marginTop: 14,
              padding: "8px 14px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.06)",
              color: D.ink2,
              border: `1px solid ${D.line2}`,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Update check-in
          </button>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 13, color: D.mut, marginBottom: 12 }}>How are you feeling?</p>

          <div style={{ marginBottom: 18 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: D.mut2,
                marginBottom: 9,
              }}
            >
              Mood
            </div>
            <MoodDotScale value={moodScore} onChange={setMoodScore} disabled={isBusy} />
          </div>

          <div style={{ marginBottom: 18 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: D.mut2,
                marginBottom: 9,
              }}
            >
              Stress level
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              {STRESS_SEGMENTS.map((label, i) => {
                const isActive = i === stressSegmentIndex;
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleStressSelect(i)}
                    style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "9px 0",
                      borderRadius: 10,
                      fontSize: 12.5,
                      fontWeight: 600,
                      background: isActive ? M.greenDim : "rgba(255,255,255,0.03)",
                      color: isActive ? M.green : D.mut,
                      border: `1px solid ${isActive ? "transparent" : D.line}`,
                      cursor: isBusy ? "not-allowed" : "pointer",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            disabled={!canSave || isBusy}
            onClick={() => upsertMutation.mutate()}
            style={{
              padding: "10px 18px",
              borderRadius: 11,
              background: canSave && !isBusy ? M.amber : "rgba(255,255,255,0.06)",
              color: canSave && !isBusy ? "#04130c" : D.mut,
              border: "none",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: canSave && !isBusy ? "pointer" : "not-allowed",
              transition: "all 150ms ease",
            }}
          >
            {upsertMutation.isPending
              ? "Saving…"
              : existingCheckIn
                ? "Update check-in"
                : "Save check-in"}
          </button>

          {upsertMutation.isError ? (
            <p style={{ color: "#f0506a", fontSize: 12, marginTop: 8 }} role="alert">
              {upsertMutation.error instanceof Error
                ? upsertMutation.error.message
                : "Could not save."}
            </p>
          ) : null}
        </div>
      )}
    </DarkCard>
  );
}

// ── Reflection card ──────────────────────────────────────────────

type ReflectCardProps = {
  selectedDate: string;
  existingFeedback: TodayDailyFeedback | null;
  isBusy: boolean;
  onSave: (notes: string) => void;
  isSaving: boolean;
};

function ReflectCard({
  existingFeedback,
  isBusy,
  onSave,
  isSaving,
}: ReflectCardProps) {
  const [notes, setNotes] = useState(existingFeedback?.notes ?? "");

  useEffect(() => {
    setNotes(existingFeedback?.notes ?? "");
  }, [existingFeedback]);

  const hasSaved = !!existingFeedback?.notes;
  const busy = isBusy || isSaving;

  return (
    <DarkCard style={{ marginBottom: 16 }}>
      <CardHead
        icon="moon"
        color={M.indigo}
        title="Reflection"
        right={
          <span style={{ fontSize: 11.5, color: D.mut2 }}>optional</span>
        }
      />

      {hasSaved && !notes ? (
        <div
          style={{
            fontSize: 13.5,
            lineHeight: 1.55,
            color: D.ink2,
            fontStyle: "italic",
            padding: "12px 14px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.03)",
          }}
        >
          &ldquo;{existingFeedback!.notes}&rdquo;
        </div>
      ) : (
        <div>
          <textarea
            rows={3}
            placeholder="What went well today? A short note for yourself…"
            value={notes}
            disabled={busy}
            maxLength={500}
            onChange={(e) => setNotes(e.target.value)}
            style={{
              width: "100%",
              borderRadius: 12,
              padding: "12px 14px",
              background: "rgba(255,255,255,0.03)",
              border: notes ? `1px solid ${D.line2}` : `1px dashed ${D.line2}`,
              color: D.ink2,
              fontSize: 13.5,
              lineHeight: 1.55,
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          {notes.trim().length > 0 && notes.trim() !== (existingFeedback?.notes ?? "") ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onSave(notes)}
              style={{
                marginTop: 8,
                padding: "8px 14px",
                borderRadius: 10,
                background: M.indigo,
                color: "#fff",
                border: "none",
                fontSize: 13,
                fontWeight: 600,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {isSaving ? "Saving…" : "Save note"}
            </button>
          ) : null}
        </div>
      )}
    </DarkCard>
  );
}

// ── Empty hero ───────────────────────────────────────────────────

function EmptyHero() {
  return (
    <div
      style={{
        height: "100%",
        minHeight: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          borderRadius: 16,
          padding: 40,
          background: D.panel,
          border: `1px solid ${D.line}`,
          maxWidth: 460,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            margin: "0 auto 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.05)",
          }}
        >
          <Icon name="sun" size={28} stroke={M.amber} />
        </div>
        <div
          style={{ fontSize: 20, fontWeight: 700, color: D.ink, marginBottom: 8 }}
        >
          Your day will appear here
        </div>
        <div
          style={{
            fontSize: 14,
            color: D.mut,
            lineHeight: 1.55,
            marginBottom: 22,
          }}
        >
          Your coach doesn&apos;t know your goals and schedule yet. A few minutes in
          onboarding — and your daily plan will build itself.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/goals"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 17px",
              borderRadius: 12,
              background: M.green,
              color: "#04130c",
              fontWeight: 600,
              fontSize: 14.5,
              textDecoration: "none",
            }}
          >
            <Icon name="arrow" size={17} stroke="#04130c" sw={1.9} />
            Create your first goal
          </Link>
          <Link
            href="/chat"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 17px",
              borderRadius: 12,
              background: "transparent",
              color: D.ink2,
              fontWeight: 600,
              fontSize: 14.5,
              border: `1px solid ${D.line2}`,
              textDecoration: "none",
            }}
          >
            <Icon name="chat" size={17} stroke={D.ink2} sw={1.9} />
            Ask the coach
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Loading / Error states ───────────────────────────────────────

function TodayLoading() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 240,
        color: D.mut,
        fontSize: 14,
      }}
    >
      Loading your day…
    </div>
  );
}

function TodayError({ message }: { message: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 240,
        color: "#f0506a",
        fontSize: 14,
      }}
      role="alert"
    >
      {message}
    </div>
  );
}

// ── Main TodayWorkspace ──────────────────────────────────────────

export function TodayWorkspace() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [selectedDate] = useState(() => formatLocalIsoDate(new Date()));
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [activeCrisisSupport, setActiveCrisisSupport] =
    useState<WellbeingCrisisEvaluation | null>(null);

  // ── Queries ──
  const dayQuery = useQuery({
    queryKey: apiQueryKeys.todayDay(selectedDate),
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");
      const result = await getTodayDay(token, selectedDate);
      if (result.error) throw new Error(result.error);
      if (!result.data) throw new Error("Today checklist could not be loaded.");
      return result.data;
    },
  });

  const recoveryQuery = useQuery({
    queryKey: apiQueryKeys.recoveryContext(selectedDate),
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");
      const result = await getRecoveryContext(token, selectedDate);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Recovery context could not be loaded.");
      }
      return result.data;
    },
  });

  // ── Mutations ──
  const invalidateToday = () => {
    for (const queryKey of getTodayItemStatusRefreshQueryKeys()) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  const updateItemMutation = useMutation({
    mutationFn: async ({
      itemId,
      status,
    }: {
      itemId: string;
      status: "completed" | "skipped";
    }) => {
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");
      const result = await updateTodayItemStatus(token, selectedDate, itemId, { status });
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Task could not be updated.");
      }
      return result.data;
    },
    onMutate: ({ itemId }) => setUpdatingItemId(itemId),
    onSettled: () => setUpdatingItemId(null),
    onSuccess: () => invalidateToday(),
  });

  const updateFeedbackMutation = useMutation({
    mutationFn: async (notes: string) => {
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");
      const result = await updateTodayFeedback(token, selectedDate, { notes });
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Feedback could not be saved.");
      }
      return result.data;
    },
    onSuccess: () => invalidateToday(),
  });

  const isBusy = updateItemMutation.isPending || dayQuery.isFetching;

  // ── Early states ──
  if (dayQuery.isLoading) return <TodayLoading />;

  if (dayQuery.isError) {
    return (
      <TodayError
        message={
          dayQuery.error instanceof Error
            ? dayQuery.error.message
            : "Today could not be loaded."
        }
      />
    );
  }

  const day = dayQuery.data;
  const items = day?.items ?? [];
  const adherence = day?.adherence ?? {
    score: null,
    completedRequired: 0,
    totalRequired: 0,
    completedOptional: 0,
    skippedRequired: 0,
    skippedOptional: 0,
  };

  // ── Empty state detection ──
  const hasWorkout = !!day?.workout;
  const hasNutrition = !!day?.nutrition?.activeRevision?.payload;
  const hasItems = items.length > 0;
  const isEmpty = !hasWorkout && !hasNutrition && !hasItems;

  if (isEmpty) {
    return <EmptyHero />;
  }

  // ── Recovery data ──
  const recoveryContext = recoveryQuery.data?.context ?? null;
  const focusView = recoveryContext ? buildRecoveryFocusView(recoveryContext) : null;
  const recoveryBand = recoveryContext?.payload?.band ?? null;
  const focusMessage = focusView?.focusMessage ?? null;

  // ── Workout checklist item (for the direct mark-done write) ──
  const workoutItem = items.find((i) => i.kind === "workout" || i.source.type === "workout_session") ?? null;
  const workoutItemDone = workoutItem?.status === "completed";

  // ── Progress chip ──
  const allDone =
    adherence.totalRequired > 0 &&
    adherence.completedRequired === adherence.totalRequired;
  const progressChip = allDone ? (
    <Chip tone="green">
      <Icon name="checkSm" size={13} stroke={M.green} sw={2.4} />
      All done
    </Chip>
  ) : (
    <Chip>{formatTaskCountChip(adherence)}</Chip>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: D.bg,
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 0 18px",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: D.mut, marginBottom: 3 }}>
            {formatTopBarDate(selectedDate)}
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: -0.3,
              color: D.ink,
              margin: 0,
            }}
          >
            Today
          </h1>
        </div>
        {progressChip}
      </div>

      {/* Crisis panel (elevated above columns) */}
      {activeCrisisSupport?.shouldShowCrisisSupport && activeCrisisSupport.copy ? (
        <div style={{ marginBottom: 16 }}>
          <CrisisSupportPanel copy={activeCrisisSupport.copy} titleId="today-crisis-support-title" />
        </div>
      ) : null}

      {/* Two-column grid */}
      <div
        style={{
          display: "flex",
          gap: 16,
          flex: 1,
          overflow: "auto",
          minHeight: 0,
        }}
      >
        {/* LEFT column */}
        <div
          style={{
            flex: "1.7 1 0",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <DayStrip
            band={recoveryBand}
            focusMessage={focusMessage}
            isLoading={recoveryQuery.isLoading}
          />

          <MoveCard
            workout={day?.workout ?? null}
            workoutItemDone={workoutItemDone}
            workoutItemId={workoutItem?.id ?? null}
            isBusy={isBusy}
            onMarkDone={(itemId) => {
              if (!updateItemMutation.isPending) {
                updateItemMutation.mutate({ itemId, status: "completed" });
              }
            }}
            selectedDate={selectedDate}
          />

          <FoodCard
            nutrition={day?.nutrition ?? null}
            selectedDate={selectedDate}
            isBusy={isBusy}
            onRefresh={invalidateToday}
          />

          <HabitsCard
            items={items}
            isBusy={isBusy}
            onMark={(itemId, status) => {
              if (!updateItemMutation.isPending) {
                updateItemMutation.mutate({ itemId, status });
              }
            }}
            updatingItemId={updatingItemId}
          />

          {updateItemMutation.isError ? (
            <p style={{ color: "#f0506a", fontSize: 12, marginTop: 8 }} role="alert">
              {updateItemMutation.error instanceof Error
                ? updateItemMutation.error.message
                : "Could not update task."}
            </p>
          ) : null}
        </div>

        {/* RIGHT column */}
        <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column" }}>
          <CheckinCard
            selectedDate={selectedDate}
            onCrisisSupportChange={setActiveCrisisSupport}
          />

          <ReflectCard
            selectedDate={selectedDate}
            existingFeedback={day?.feedback ?? null}
            isBusy={isBusy}
            onSave={(notes) => updateFeedbackMutation.mutate(notes)}
            isSaving={updateFeedbackMutation.isPending}
          />

          <DarkCard style={{ padding: 8 }}>
            <QuickLinkRow icon="dumbbell" label="Weekly workout plan" href="/training" border />
            <QuickLinkRow icon="fork" label="Weekly nutrition plan" href="/nutrition" border />
            <QuickLinkRow icon="chat" label="Talk to your coach" href="/chat" />
          </DarkCard>
        </div>
      </div>
    </div>
  );
}
