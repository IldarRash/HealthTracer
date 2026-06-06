"use client";

import { useState } from "react";
import {
  buildLongevityWeekEyebrowFromAnchorDate,
  todayIsoDate,
} from "../../lib/longevity-ui-state";
import { Icon } from "../ui";

/** Build an ISO date string offset by N weeks from an anchor date. */
function offsetWeek(anchorDate: string, delta: number): string {
  const [year, month, day] = anchorDate.split("-").map(Number);
  const d = new Date(year!, month! - 1, day!);
  d.setDate(d.getDate() + delta * 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function LongevityPageHeader() {
  const currentDate = todayIsoDate();
  const [weekOffset, setWeekOffset] = useState(0);

  const anchorDate = weekOffset === 0 ? currentDate : offsetWeek(currentDate, weekOffset);
  const eyebrow = buildLongevityWeekEyebrowFromAnchorDate(anchorDate);
  const isCurrentWeek = weekOffset === 0;

  return (
    <header
      className="page-header"
      style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}
    >
      {/* Left: eyebrow + title + description */}
      <div>
        <p className="page-header__eyebrow">{eyebrow}</p>
        <h1 className="page-header__title">Longevity</h1>
        <p className="page-header__description">
          Your weekly wellness overview across Today, training, nutrition, goals, and logged signals.
        </p>
      </div>

      {/* Right: week navigation chips */}
      <nav
        aria-label="Week navigation"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingTop: 4,
          flexShrink: 0,
        }}
      >
        {/* Prev week */}
        <button
          type="button"
          aria-label="Previous week"
          onClick={() => setWeekOffset((o) => o - 1)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            border: "1px solid var(--color-border-default)",
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--color-text-muted)",
            transition: "border-color 150ms ease, color 150ms ease",
          }}
        >
          <span style={{ transform: "rotate(180deg)", display: "flex" }} aria-hidden="true">
            <Icon name="chevR" size={16} stroke="currentColor" />
          </span>
        </button>

        {/* This week chip */}
        <button
          type="button"
          aria-label="Jump to current week"
          onClick={() => setWeekOffset(0)}
          disabled={isCurrentWeek}
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid var(--color-border-default)",
            background: isCurrentWeek ? "rgba(25,195,125,0.12)" : "rgba(255,255,255,0.04)",
            color: isCurrentWeek ? "var(--color-metric-green)" : "var(--color-text-muted)",
            fontSize: 12,
            fontWeight: 600,
            cursor: isCurrentWeek ? "default" : "pointer",
            transition: "background 150ms ease, color 150ms ease",
            whiteSpace: "nowrap",
          }}
        >
          This week
        </button>

        {/* Next week */}
        <button
          type="button"
          aria-label="Next week"
          onClick={() => setWeekOffset((o) => o + 1)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            border: "1px solid var(--color-border-default)",
            background: "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--color-text-muted)",
            transition: "border-color 150ms ease, color 150ms ease",
          }}
        >
          <Icon name="chevR" size={16} stroke="currentColor" />
        </button>
      </nav>
    </header>
  );
}
