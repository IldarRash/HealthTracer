"use client";

/**
 * MoodDotScale — 5-dot horizontal mood selector.
 * No digits, no emoji. Color dots only: red→amber→mid→green→green.
 * Maps to WellbeingScore 1–5.
 */
import type { WellbeingScore } from "@health/types";

const MOOD_DOTS: {
  score: WellbeingScore;
  color: string;
  label: string;
}[] = [
  { score: 1, color: "#f0506a", label: "Low" },
  { score: 2, color: "#f5a524", label: "Fair" },
  { score: 3, color: "#c9b24a", label: "Okay" },
  { score: 4, color: "#19c37d", label: "Good" },
  { score: 5, color: "#19c37d", label: "Great" },
];

export type MoodDotScaleProps = {
  value: WellbeingScore | null;
  onChange: (score: WellbeingScore) => void;
  disabled?: boolean;
};

export function MoodDotScale({ value, onChange, disabled = false }: MoodDotScaleProps) {
  return (
    <div style={{ display: "flex", gap: 6 }} role="group" aria-label="Mood">
      {MOOD_DOTS.map(({ score, color, label }) => {
        const isSelected = value === score;
        return (
          <button
            key={score}
            type="button"
            disabled={disabled}
            onClick={() => onChange(score)}
            aria-label={label}
            aria-pressed={isSelected}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 7,
              padding: "9px 0",
              borderRadius: 11,
              border: `1.5px solid ${isSelected ? color : "rgba(255,255,255,0.075)"}`,
              background: isSelected ? `${color}22` : "rgba(255,255,255,0.02)",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
              transition: "all 150ms ease",
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: color,
                opacity: isSelected ? 1 : 0.45,
                display: "block",
                transition: "opacity 150ms ease",
              }}
              aria-hidden
            />
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: isSelected ? "#cfd4d7" : "#5e656a",
                lineHeight: 1,
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
