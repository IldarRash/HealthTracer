"use client";

/**
 * NutritionWeekPlan — C2 read-only 7-day meal grid.
 *
 * Renders the weekly plan from `payload.weeklyPlan` (optional on the active
 * revision). Layout: CSS grid `128px repeat(4, 1fr) 92px`, today-row
 * highlight, header average-kcal chip, allergy/corridor info line, and the
 * "Собрать список покупок" CTA routing to the grocery screen (C3).
 *
 * This component is purely presentational — it never mutates plan state.
 * All plan changes route through chat → typed proposal → new revision.
 *
 * Loading and error states are owned by NutritionWorkspace, which gates
 * rendering this component behind TanStack Query isLoading/isError checks.
 * Reuses: CoachNotes, Icon, IconBadge from shared UI.
 */

import Link from "next/link";
import { useState, type ReactElement } from "react";
import type { NutritionWeekDay } from "@health/types";
import { CoachNotes, Icon, IconBadge } from "../ui";

// ── Constants ─────────────────────────────────────────────────────

/** ISO weekday labels, Monday = 1. */
const WEEKDAY_LABELS: Record<number, string> = {
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
  7: "Вс",
};

/** Column grid template — shared by header and every row. */
const GRID_COLS = "128px repeat(4, 1fr) 92px";

// ── Date helpers ──────────────────────────────────────────────────

/**
 * Returns the Monday (start) of the ISO week that contains `date`.
 * ISO weekday: Mon = 1 … Sun = 7.
 */
function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon, …
  const iso = dayOfWeek === 0 ? 7 : dayOfWeek; // convert to ISO (Sun → 7)
  d.setDate(d.getDate() - (iso - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format a Date as Russian short date: "2 июн". */
const RU_MONTHS = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

function formatRuShortDate(d: Date): string {
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]}`;
}

/** Returns the ISO weekday (1–7) for today in the user's local zone. */
function getTodayIsoWeekday(): number {
  const dow = new Date().getDay(); // 0 = Sun
  return dow === 0 ? 7 : dow;
}

/** Returns a date string "YYYY-MM-DD" for the given date in local time. */
function toLocalIsoDateString(d: Date): string {
  return d.toLocaleDateString("sv-SE"); // ISO 8601 in local time
}

// ── Chip primitives (inline — no shared Chip component exists) ────

type InlineChipProps = {
  children: React.ReactNode;
  tone: "green" | "neutral";
};

function InlineChip({ children, tone }: InlineChipProps): ReactElement {
  const green = tone === "green";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: green ? "rgba(25,195,125,0.14)" : "rgba(255,255,255,0.07)",
        color: green ? "var(--color-metric-green)" : "var(--color-text-secondary)",
        border: green
          ? "1px solid rgba(25,195,125,0.22)"
          : "1px solid var(--color-border-default)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// ── Grid header row ───────────────────────────────────────────────

const HEADER_EYEBROW: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
};

function WeekGridHeader(): ReactElement {
  return (
    <div
      role="row"
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLS,
        background: "var(--color-surface-panel, rgba(255,255,255,0.04))",
        borderBottom: "1px solid var(--color-border-default)",
        padding: "10px 16px",
        gap: 8,
        alignItems: "center",
      }}
    >
      <span style={HEADER_EYEBROW} role="columnheader">
        День
      </span>
      {(
        [
          { label: "Завтрак", icon: "sun" },
          { label: "Обед", icon: "fork" },
          { label: "Перекус", icon: "drop" },
          { label: "Ужин", icon: "moon" },
        ] as const
      ).map(({ label, icon }) => (
        <div
          key={label}
          role="columnheader"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            ...HEADER_EYEBROW,
          }}
        >
          <Icon
            name={icon}
            size={13}
            stroke="var(--color-text-muted)"
            aria-hidden
          />
          {label}
        </div>
      ))}
      <span
        role="columnheader"
        style={{ ...HEADER_EYEBROW, textAlign: "right" }}
      >
        Σ ккал
      </span>
    </div>
  );
}

// ── Single day row ────────────────────────────────────────────────

type DayRowProps = {
  day: NutritionWeekDay;
  date: Date;
  isToday: boolean;
  isLast: boolean;
};

function DayRow({ day, date, isToday, isLast }: DayRowProps): ReactElement {
  const label = WEEKDAY_LABELS[day.weekday] ?? `д${day.weekday}`;
  const dateStr = formatRuShortDate(date);

  return (
    <div
      role="row"
      aria-label={`${label}${isToday ? ", сегодня" : ""}, ${dateStr}`}
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLS,
        background: isToday ? "rgba(25,195,125,0.06)" : "transparent",
        borderBottom: isLast ? "none" : "1px solid var(--color-border-default)",
        padding: "12px 16px",
        gap: 8,
        alignItems: "center",
      }}
    >
      {/* Day cell */}
      <div
        role="rowheader"
        style={{ display: "flex", alignItems: "center", gap: 10 }}
      >
        {/* Weekday badge */}
        <div
          aria-hidden="true"
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: isToday
              ? "var(--color-metric-green, #19c37d)"
              : "rgba(255,255,255,0.06)",
            color: isToday ? "#04130c" : "var(--color-text-primary)",
            fontSize: 13,
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          {label}
        </div>
        {/* Date + today label */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-text-primary)",
            }}
          >
            {dateStr}
          </span>
          {isToday ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-metric-green)",
              }}
            >
              сегодня
            </span>
          ) : null}
        </div>
      </div>

      {/* Four meal cells */}
      {[day.breakfast, day.lunch, day.snack, day.dinner].map((text, i) => (
        <span
          key={i}
          role="cell"
          title={text ?? undefined}
          style={{
            fontSize: 13,
            color: text ? "var(--color-text-secondary)" : "var(--color-text-muted)",
            lineHeight: 1.35,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {text ?? "—"}
        </span>
      ))}

      {/* Σ kcal cell */}
      <span
        role="cell"
        style={{
          fontSize: 15,
          fontWeight: 700,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          color: isToday
            ? "var(--color-metric-green)"
            : "var(--color-text-primary)",
        }}
      >
        {day.kcal ?? "—"}
      </span>
    </div>
  );
}

// ── Grocery CTA (hover state via local state) ─────────────────────

function GroceryCta(): ReactElement {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href="/nutrition/grocery-list"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "12px 20px",
        borderRadius: 14,
        background: hovered ? "rgba(25,195,125,0.18)" : "rgba(25,195,125,0.10)",
        border: "1px solid rgba(25,195,125,0.28)",
        color: "var(--color-metric-green)",
        fontSize: 13.5,
        fontWeight: 600,
        textDecoration: "none",
        whiteSpace: "nowrap",
        transition: "background 150ms ease",
        flexShrink: 0,
      }}
      aria-label="Собрать список покупок"
    >
      <Icon name="fork" size={16} stroke="var(--color-metric-green)" aria-hidden />
      Собрать список покупок
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────

export type NutritionWeekPlanProps = {
  /**
   * The `weeklyPlan` array from the active nutrition revision payload.
   * Pass `undefined` / `null` to show the empty state (coach hasn't set
   * a weekly plan yet).
   */
  weeklyPlan: NutritionWeekDay[] | null | undefined;
};

export function NutritionWeekPlan({
  weeklyPlan,
}: NutritionWeekPlanProps): ReactElement {
  const today = new Date();
  const todayIso = toLocalIsoDateString(today);
  const todayWeekday = getTodayIsoWeekday();
  const weekMonday = getWeekMonday(today);

  // ── Empty state — no weeklyPlan on the active revision ─────────
  if (!weeklyPlan || weeklyPlan.length === 0) {
    return (
      <div
        style={{
          background: "var(--color-surface-card)",
          border: "1px solid var(--color-border-default)",
          borderRadius: 16,
          padding: 22,
        }}
        aria-label="Рацион на неделю"
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <IconBadge icon="fork" color="var(--color-metric-green)" size={26} />
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--color-text-primary)",
              }}
            >
              Рацион на неделю
            </span>
          </div>
          <InlineChip tone="neutral">
            <Icon name="lock" size={12} stroke="currentColor" aria-hidden />
            Только просмотр
          </InlineChip>
        </div>

        {/* Empty body */}
        <div
          style={{
            borderRadius: 13,
            border: "1px dashed var(--color-border-muted, rgba(255,255,255,0.12))",
            padding: "28px 20px",
            textAlign: "center",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 10,
            }}
          >
            <Icon name="fork" size={24} stroke="var(--color-metric-green)" />
          </div>
          <p
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--color-text-primary)",
              margin: 0,
            }}
          >
            Недельный план ещё не задан
          </p>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--color-text-muted)",
              marginTop: 6,
              lineHeight: 1.5,
              maxWidth: 380,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Коуч ещё не составил недельную раскладку. Попросите об этом в чате —
            и после принятия предложения план появится здесь.
          </p>
          <Link
            href="/chat"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 14,
              padding: "8px 16px",
              borderRadius: 12,
              background: "rgba(25,195,125,0.12)",
              border: "1px solid rgba(25,195,125,0.28)",
              color: "var(--color-metric-green)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <Icon name="chat" size={14} stroke="var(--color-metric-green)" />
            Открыть чат с коучем
          </Link>
        </div>
      </div>
    );
  }

  // ── Sort days Пн→Вс and compute weekly average ─────────────────
  const sorted = [...weeklyPlan].sort((a, b) => a.weekday - b.weekday);
  const daysWithKcal = sorted.filter((d) => d.kcal != null && d.kcal > 0);
  const avgKcal =
    daysWithKcal.length > 0
      ? Math.round(
          daysWithKcal.reduce((sum, d) => sum + (d.kcal ?? 0), 0) /
            daysWithKcal.length,
        )
      : null;

  return (
    <section
      aria-label="Рацион на неделю"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {/* ── Card: header chips + table ── */}
      <div
        style={{
          background: "var(--color-surface-card)",
          border: "1px solid var(--color-border-default)",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {/* Card header: title + chips */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px",
            gap: 12,
            flexWrap: "wrap",
            borderBottom: "1px solid var(--color-border-default)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <IconBadge icon="fork" color="var(--color-metric-green)" size={26} />
            <span
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--color-text-primary)",
              }}
            >
              Рацион на неделю
            </span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {avgKcal != null ? (
              <InlineChip tone="green">≈ {avgKcal} ккал / день в среднем</InlineChip>
            ) : null}
            <InlineChip tone="neutral">
              <Icon name="lock" size={12} stroke="currentColor" aria-hidden />
              Только просмотр
            </InlineChip>
          </div>
        </div>

        {/* Grid table */}
        <div role="table" aria-label="Недельный план питания">
          <WeekGridHeader />
          {sorted.map((day, idx) => {
            // Compute the real calendar date for this weekday in the current week
            const dayDate = new Date(weekMonday);
            dayDate.setDate(weekMonday.getDate() + (day.weekday - 1));
            const dayIso = toLocalIsoDateString(dayDate);
            const isToday = dayIso === todayIso && day.weekday === todayWeekday;
            return (
              <DayRow
                key={day.weekday}
                day={day}
                date={dayDate}
                isToday={isToday}
                isLast={idx === sorted.length - 1}
              />
            );
          })}
        </div>
      </div>

      {/* ── Allergy/corridor note + CTA ── */}
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "stretch",
          flexWrap: "wrap",
        }}
      >
        {/* Allergy info line */}
        <div
          style={{
            flex: "1 1 240px",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            background: "var(--color-surface-card)",
            border: "1px solid var(--color-border-default)",
            borderRadius: 14,
            padding: "12px 16px",
          }}
        >
          <span style={{ flexShrink: 0, marginTop: 1, display: "flex" }}>
            <Icon
              name="info"
              size={16}
              stroke="var(--color-text-muted)"
              aria-hidden
            />
          </span>
          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              color: "var(--color-text-muted)",
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: "var(--color-text-secondary)" }}>*</strong>{" "}
            Орехи — только без арахиса (аллергия учтена). Калории за день держатся
            в коридоре ±10% от цели — это норма.
          </p>
        </div>

        {/* CTA — Собрать список покупок */}
        <GroceryCta />
      </div>

      {/* ── CoachNotes (weekly rhythm) ── */}
      <CoachNotes>
        В субботу заложен чуть больший день — это осознанно, под активные
        выходные. В воскресенье — легче и больше овощей для восстановления.
      </CoachNotes>
    </section>
  );
}

