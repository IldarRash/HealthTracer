"use client";

/**
 * MealCaloriesBreakdown — C1 per-meal calorie + macro breakdown section.
 *
 * Renders a two-card row:
 *   LEFT  — dark «Итог за день» instrument: DsRing (kcal sum vs day target) +
 *            per-day Б/У/Ж totals (green / blue / indigo tiles).
 *   RIGHT — light per-meal list: one row per meal with icon badge, name, time,
 *            dish example, proportional amber ProgressBar, MacroMini, and kcal value.
 *
 * Read-only — no mutations. Plan edits flow only via chat.
 * Falls back gracefully when per-meal data is absent (no kcal on any slot).
 *
 * Design ref: handoff-seg2.png / «Калории по приёмам пищи» frame.
 */

import { type ReactElement } from "react";
import type { NutritionMealCaloriesReadModel, NutritionMealCaloriesRow } from "@health/types";
import { DsRing, Icon, IconBadge, MacroMini, ProgressBar, SectionError, SkeletonCard } from "../ui";

// ── Helpers ──────────────────────────────────────────────────────

/** Map meal label to icon name — mirrors the MealStructure mapping. */
const MEAL_ICON_MAP: Array<[string, Parameters<typeof Icon>[0]["name"]]> = [
  ["завтрак", "sun"],
  ["breakfast", "sun"],
  ["перекус", "drop"],
  ["snack", "drop"],
  ["обед", "fork"],
  ["lunch", "fork"],
  ["ужин", "moon"],
  ["dinner", "moon"],
  ["перед тренировкой", "bolt"],
  ["pre-workout", "bolt"],
  ["pre workout", "bolt"],
];

function getMealIcon(label: string): Parameters<typeof Icon>[0]["name"] {
  const lower = label.toLowerCase();
  for (const [key, icon] of MEAL_ICON_MAP) {
    if (lower.includes(key)) return icon;
  }
  return "fork";
}

// ── DayTotalCard (LEFT) ──────────────────────────────────────────

type DayTotalCardProps = {
  totalKcal: number;
  caloriesPerDay: number | null;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
};

function DayTotalCard({
  totalKcal,
  caloriesPerDay,
  totalProtein,
  totalCarbs,
  totalFat,
}: DayTotalCardProps): ReactElement {
  const dayTarget = caloriesPerDay ?? 0;
  const pct = dayTarget > 0 ? Math.round((totalKcal / dayTarget) * 100) : 0;
  const remaining = dayTarget - totalKcal;

  return (
    <div
      className="meal-calories-breakdown__day-card"
      aria-label="Итог за день"
    >
      {/* Card header */}
      <div className="meal-calories-breakdown__card-head">
        <IconBadge icon="fork" color="var(--color-metric-amber)" size={26} />
        <span className="meal-calories-breakdown__card-title">Итог за день</span>
      </div>

      {/* Ring */}
      <div className="meal-calories-breakdown__ring-wrap">
        <DsRing
          value={Math.min(pct, 100)}
          size={148}
          sw={13}
          color="var(--color-metric-amber)"
          track="rgba(255,255,255,0.08)"
          label={totalKcal}
        />
      </div>

      {/* Caption */}
      {dayTarget > 0 ? (
        <p className="meal-calories-breakdown__ring-caption">
          из {dayTarget} ккал · цель плана · осталось{" "}
          <span
            style={{
              color:
                remaining < 0
                  ? "var(--color-metric-amber)"
                  : "var(--color-text-primary)",
              fontWeight: 700,
            }}
          >
            {remaining}
          </span>
        </p>
      ) : (
        <p className="meal-calories-breakdown__ring-caption">
          Цель по калориям не задана
        </p>
      )}

      {/* Б / У / Ж totals */}
      <div className="meal-calories-breakdown__macro-tiles">
        {(
          [
            ["Белок", totalProtein, "var(--color-metric-green)"],
            ["Углев.", totalCarbs, "var(--color-metric-blue)"],
            ["Жиры", totalFat, "var(--color-metric-indigo)"],
          ] as const
        ).map(([label, value, color]) => (
          <div key={label} className="meal-calories-breakdown__macro-tile">
            <span
              className="meal-calories-breakdown__macro-tile-value"
              style={{ color }}
            >
              {value}
            </span>
            <span className="meal-calories-breakdown__macro-tile-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MealRow ──────────────────────────────────────────────────────

type MealRowProps = {
  meal: NutritionMealCaloriesRow;
  /** The maximum kcal across all meals — used to scale proportional bar. */
  maxKcal: number;
  isLast: boolean;
};

function MealRow({ meal, maxKcal, isLast }: MealRowProps): ReactElement {
  const barPct = meal.kcal != null && maxKcal > 0
    ? Math.round((meal.kcal / maxKcal) * 100)
    : 0;

  const hasAllMacros =
    meal.proteinGrams != null &&
    meal.carbsGrams != null &&
    meal.fatGrams != null;

  return (
    <div
      className="meal-calories-breakdown__meal-row"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--color-border-default)",
      }}
    >
      {/* Icon badge */}
      <div
        className="meal-calories-breakdown__meal-icon"
        aria-hidden="true"
      >
        <Icon name={getMealIcon(meal.label)} size={18} stroke="var(--color-metric-amber)" />
      </div>

      {/* Name + time + dish */}
      <div className="meal-calories-breakdown__meal-info">
        <div className="meal-calories-breakdown__meal-name-row">
          <span className="meal-calories-breakdown__meal-name">{meal.label}</span>
          {meal.mealTime ? (
            <span className="meal-calories-breakdown__meal-time">{meal.mealTime}</span>
          ) : meal.timingHint ? (
            <span className="meal-calories-breakdown__meal-time">{meal.timingHint}</span>
          ) : null}
          {meal.changed ? (
            <span className="meal-calories-breakdown__meal-badge" aria-label="новый вариант">
              новое
            </span>
          ) : null}
        </div>
        {meal.dish ? (
          <p className="meal-calories-breakdown__meal-dish">{meal.dish}</p>
        ) : null}

        {/* Proportional kcal bar + MacroMini inline */}
        {meal.kcal != null ? (
          <div className="meal-calories-breakdown__bar-row">
            <div className="meal-calories-breakdown__bar-wrap">
              <ProgressBar
                value={barPct}
                color="var(--color-metric-amber)"
                trackColor="rgba(255,255,255,0.12)"
                height={5}
              />
            </div>
            {hasAllMacros ? (
              <MacroMini
                protein={meal.proteinGrams ?? 0}
                carbs={meal.carbsGrams ?? 0}
                fat={meal.fatGrams ?? 0}
                showUnit={false}
                className="meal-calories-breakdown__macro-mini"
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Right: kcal */}
      {meal.kcal != null ? (
        <div className="meal-calories-breakdown__meal-kcal" aria-label={`${meal.kcal} ккал`}>
          <span className="meal-calories-breakdown__meal-kcal-value">{meal.kcal}</span>
          <span className="meal-calories-breakdown__meal-kcal-unit">ккал</span>
        </div>
      ) : null}
    </div>
  );
}

// ── MealListCard (RIGHT) ──────────────────────────────────────────

type MealListCardProps = {
  meals: NutritionMealCaloriesRow[];
};

function MealListCard({ meals }: MealListCardProps): ReactElement {
  const maxKcal = Math.max(...meals.map((m) => m.kcal ?? 0), 1);

  return (
    <div
      className="meal-calories-breakdown__list-card"
      aria-label="Калории по приёмам пищи"
    >
      {/* Card header */}
      <div className="meal-calories-breakdown__card-head">
        <IconBadge icon="today" color="var(--color-metric-green)" size={26} />
        <span className="meal-calories-breakdown__card-title">Калории по приёмам пищи</span>
        <span className="meal-calories-breakdown__list-note">примерная оценка</span>
      </div>

      {/* Meal rows */}
      {meals.length > 0 ? (
        <div className="meal-calories-breakdown__meal-list">
          {meals.map((meal, i) => (
            <MealRow
              key={meal.label}
              meal={meal}
              maxKcal={maxKcal}
              isLast={i === meals.length - 1}
            />
          ))}
        </div>
      ) : (
        <p className="meal-calories-breakdown__empty-label">
          Приёмы пищи не заданы.
        </p>
      )}
    </div>
  );
}

// ── FallbackNoPlanData ───────────────────────────────────────────

/**
 * Shown when the active plan has no per-meal estimates.
 * Falls back to the daily targets context only.
 */
function FallbackNoPlanData({
  caloriesPerDay,
}: {
  caloriesPerDay: number | null;
}): ReactElement {
  return (
    <div
      className="meal-calories-breakdown__fallback"
      role="status"
    >
      <Icon name="info" size={18} stroke="var(--color-text-muted)" aria-hidden />
      <p className="meal-calories-breakdown__fallback-text">
        {caloriesPerDay != null
          ? `Цель по калориям: ${caloriesPerDay} ккал/день. Разбивка по приёмам появится, когда коуч добавит детали плана.`
          : "Детальная разбивка по приёмам пищи появится, когда коуч составит план с указанием калорий на каждый приём."}
      </p>
    </div>
  );
}

// ── Public API ────────────────────────────────────────────────────

export type MealCaloriesBreakdownState =
  | { state: "loading" }
  | { state: "error"; onRetry?: () => void }
  | { state: "empty" }
  | { state: "data"; model: NutritionMealCaloriesReadModel };

/**
 * C1 — Калории по приёмам пищи.
 *
 * Composite section: dark «Итог за день» ring + light per-meal list.
 * Exported for direct use in NutritionWorkspace.
 */
export function MealCaloriesBreakdown(
  props: MealCaloriesBreakdownState,
): ReactElement {
  if (props.state === "loading") {
    return (
      <div className="meal-calories-breakdown" aria-busy="true" aria-label="Загрузка разбивки по приёмам">
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ width: 290, flexShrink: 0 }}>
            <SkeletonCard h={280} head={false} />
          </div>
          <div style={{ flex: 1 }}>
            <SkeletonCard h={280} head={false} />
          </div>
        </div>
      </div>
    );
  }

  if (props.state === "error") {
    return (
      <SectionError
        label="Разбивка по приёмам не загрузилась"
        height={120}
        onRetry={props.onRetry}
      />
    );
  }

  if (props.state === "empty") {
    return (
      <FallbackNoPlanData caloriesPerDay={null} />
    );
  }

  const { model } = props;

  // When no per-meal kcal data is present, show a fallback notice instead of
  // an empty ring + empty list (degrades gracefully for legacy day-only plans).
  if (!model.hasPerMealData) {
    return <FallbackNoPlanData caloriesPerDay={model.caloriesPerDay} />;
  }

  return (
    <div className="meal-calories-breakdown">
      <div className="meal-calories-breakdown__row">
        {/* LEFT: dark day total card */}
        <DayTotalCard
          totalKcal={model.totalKcal}
          caloriesPerDay={model.caloriesPerDay}
          totalProtein={model.totalProtein}
          totalCarbs={model.totalCarbs}
          totalFat={model.totalFat}
        />

        {/* RIGHT: light per-meal list */}
        <MealListCard meals={model.meals} />
      </div>
    </div>
  );
}
