/**
 * BodyFigure + MuscleMap atoms.
 *
 * BodyFigure  — front or back SVG silhouette with per-group colored ellipses
 *               driven by a muscleMap prop. The MUSCLES geometry is internal.
 *
 * MuscleMap   — composed dark instrument card: front+back figures + legend +
 *               coach hint + mandatory visual-estimate disclaimer.
 *
 * SAFETY FLOOR: MuscleMap always renders the visual-estimate disclaimer via
 * MedicalNote. It is a content floor, not an omittable prop.
 *
 * Cross-platform note: MuscleTone / MuscleGroup / MuscleMapData are exported
 * types so the Expo/NativeWind port can consume the same semantic contract.
 * The SVG geometry is web-only today.
 */

import { type ReactElement, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import { tokens } from "@health/ui";
import { Icon } from "./icon";
import { MedicalNote } from "./dark-primitives";
import { Card } from "./card";

// ── Strength tones ────────────────────────────────────────────────

export type MuscleTone = "strong" | "mid" | "weak";

/**
 * ST — fill uses 0.30 alpha (design-spec "ST" tones).
 * The existing *Dim tokens use 0.16 alpha; 0.30 is intentionally stronger.
 * Strokes reference the metric color constants.
 */
const ST: Record<MuscleTone, { fill: string; stroke: string }> = {
  strong: { fill: "rgba(25,195,125,0.30)", stroke: tokens.color.metric.green },
  mid: { fill: "rgba(245,165,36,0.30)", stroke: tokens.color.metric.amber },
  weak: { fill: "rgba(240,80,106,0.30)", stroke: tokens.color.metric.red },
};

// neutral fallback for groups absent from muscleMap
const NEUTRAL = {
  fill: "rgba(255,255,255,0.05)",
  stroke: "rgba(255,255,255,0.16)",
};

// ── Muscle-group identifiers ─────────────────────────────────────

export type MuscleGroup =
  // front view
  | "delts"
  | "chest"
  | "biceps"
  | "forearms"
  | "abs"
  | "obliques"
  | "quads"
  | "shins"
  // back view
  | "traps"
  | "reardelts"
  | "lats"
  | "triceps"
  | "lowerback"
  | "glutes"
  | "hams"
  | "calves";

export type MuscleMapData = Partial<Record<MuscleGroup, MuscleTone>>;

// ── Internal geometry (viewBox "0 0 220 440") ────────────────────
// Ellipses are placed over the silhouette path below.
// cx/cy are center coords; rx/ry are semi-axes.

type EllipseGeometry = {
  side: "front" | "back";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

const MZ_GEOMETRY: Record<MuscleGroup, EllipseGeometry> = {
  // ── FRONT ──
  // deltoids — outer shoulder caps
  delts: { side: "front", cx: 110, cy: 145, rx: 38, ry: 14 },
  // chest — pec region
  chest: { side: "front", cx: 110, cy: 168, rx: 30, ry: 18 },
  // biceps — upper arm front
  biceps: { side: "front", cx: 110, cy: 204, rx: 32, ry: 14 },
  // forearms — lower arm front
  forearms: { side: "front", cx: 110, cy: 240, rx: 28, ry: 12 },
  // abs — central abdomen
  abs: { side: "front", cx: 110, cy: 225, rx: 20, ry: 30 },
  // obliques — side torso
  obliques: { side: "front", cx: 110, cy: 240, rx: 34, ry: 14 },
  // quads — thighs front
  quads: { side: "front", cx: 110, cy: 310, rx: 32, ry: 40 },
  // shins — lower leg front
  shins: { side: "front", cx: 110, cy: 385, rx: 22, ry: 30 },

  // ── BACK ──
  // traps — upper back / trapezius
  traps: { side: "back", cx: 110, cy: 148, rx: 26, ry: 14 },
  // rear deltoids — back shoulder caps
  reardelts: { side: "back", cx: 110, cy: 145, rx: 38, ry: 14 },
  // lats — lateral back
  lats: { side: "back", cx: 110, cy: 185, rx: 32, ry: 22 },
  // triceps — back upper arm
  triceps: { side: "back", cx: 110, cy: 204, rx: 30, ry: 14 },
  // lower back — lumbar
  lowerback: { side: "back", cx: 110, cy: 235, rx: 22, ry: 18 },
  // glutes — gluteal region
  glutes: { side: "back", cx: 110, cy: 268, rx: 30, ry: 20 },
  // hamstrings — back thighs
  hams: { side: "back", cx: 110, cy: 325, rx: 30, ry: 40 },
  // calves — lower leg back
  calves: { side: "back", cx: 110, cy: 395, rx: 20, ry: 30 },
};

// ── Silhouette paths (viewBox 0 0 220 440) ───────────────────────
// Shared symmetric figure. Same outline used for both front and back.
// The overlaid ellipses indicate front vs back context.

function Silhouette(): ReactElement {
  const s = { fill: "rgba(255,255,255,0.05)", stroke: "rgba(255,255,255,0.16)" };
  const sw = 1.5;

  return (
    <>
      {/* Head */}
      <ellipse
        cx={110}
        cy={55}
        rx={22}
        ry={28}
        fill={s.fill}
        stroke={s.stroke}
        strokeWidth={sw}
      />
      {/* Neck */}
      <rect
        x={104}
        y={80}
        width={12}
        height={16}
        fill={s.fill}
        stroke={s.stroke}
        strokeWidth={sw}
      />
      {/* Torso (trapezoidal path) */}
      <path
        d="M75 96 L145 96 L152 200 L155 268 L65 268 L68 200 Z"
        fill={s.fill}
        stroke={s.stroke}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      {/* Left arm */}
      <rect
        x={48}
        y={100}
        width={22}
        height={130}
        rx={11}
        fill={s.fill}
        stroke={s.stroke}
        strokeWidth={sw}
      />
      {/* Right arm */}
      <rect
        x={150}
        y={100}
        width={22}
        height={130}
        rx={11}
        fill={s.fill}
        stroke={s.stroke}
        strokeWidth={sw}
      />
      {/* Pelvis bridge */}
      <path
        d="M65 268 L155 268 L150 295 L70 295 Z"
        fill={s.fill}
        stroke={s.stroke}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      {/* Left leg */}
      <rect
        x={72}
        y={290}
        width={36}
        height={140}
        rx={16}
        fill={s.fill}
        stroke={s.stroke}
        strokeWidth={sw}
      />
      {/* Right leg */}
      <rect
        x={112}
        y={290}
        width={36}
        height={140}
        rx={16}
        fill={s.fill}
        stroke={s.stroke}
        strokeWidth={sw}
      />
    </>
  );
}

// ── BodyFigure ────────────────────────────────────────────────────

export type BodyFigureProps = {
  side: "front" | "back";
  muscleMap: MuscleMapData;
  width?: number;
  height?: number;
  className?: string;
};

export function BodyFigure({
  side,
  muscleMap,
  width = 170,
  height = 380,
  className,
}: BodyFigureProps): ReactElement {
  const sideLabel = side === "front" ? "СПЕРЕДИ" : "СЗАДИ";

  const relevantGroups = (Object.keys(MZ_GEOMETRY) as MuscleGroup[]).filter(
    (g) => MZ_GEOMETRY[g].side === side,
  );

  return (
    <div className={cn("body-figure", className)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <span className="body-figure__side-label" aria-hidden="true">
        {sideLabel}
      </span>
      {/* SVG is decorative; the parent MuscleMap legend provides accessible text */}
      <svg
        width={width}
        height={height}
        viewBox="0 0 220 440"
        aria-hidden="true"
        role="presentation"
        style={{ display: "block" }}
      >
        <Silhouette />
        {relevantGroups.map((g) => {
          const { cx, cy, rx, ry } = MZ_GEOMETRY[g];
          const tone = muscleMap[g];
          const colors = tone != null ? ST[tone] : NEUTRAL;
          return (
            <ellipse
              key={g}
              cx={cx}
              cy={cy}
              rx={rx}
              ry={ry}
              fill={colors.fill}
              stroke={colors.stroke}
              strokeWidth={1.4}
            />
          );
        })}
      </svg>
    </div>
  );
}

// ── MuscleMap (composed dark instrument card) ─────────────────────

export type MuscleMapLegendBlock = {
  tone: MuscleTone;
  title: string;
  items: string;
};

export type MuscleMapProps = HTMLAttributes<HTMLElement> & {
  muscleMap: MuscleMapData;
  legend: readonly MuscleMapLegendBlock[];
  coachHint?: string;
  chipLabel?: string;
};

const DEFAULT_DISCLAIMER =
  "Оценка визуальная, по фотографиям — не замер состава тела и не диагноз.";

export function MuscleMap({
  muscleMap,
  legend,
  coachHint,
  chipLabel = "оценка по фото",
  className,
  ...props
}: MuscleMapProps): ReactElement {
  return (
    <Card
      className={cn("muscle-map", className)}
      aria-label="Карта мышц"
      {...props}
    >
      {/* Header */}
      <div className="muscle-map__header">
        <div className="muscle-map__header-left">
          <Icon name="dumbbell" size={18} stroke={tokens.color.metric.green} aria-hidden />
          <span className="muscle-map__title">Карта мышц · сила по группам</span>
        </div>
        <span className="muscle-map__chip">{chipLabel}</span>
      </div>

      {/* Body: figures (left) + legend (right) */}
      <div className="muscle-map__body">
        {/* Figures panel */}
        <div className="muscle-map__figures">
          <BodyFigure side="front" muscleMap={muscleMap} width={120} height={270} />
          <div className="muscle-map__divider" aria-hidden="true" />
          <BodyFigure side="back" muscleMap={muscleMap} width={120} height={270} />
        </div>

        {/* Legend */}
        <div className="muscle-map__legend" role="list" aria-label="Силовые зоны">
          {legend.map((block) => (
            <div key={block.tone} className="muscle-map__legend-block" role="listitem">
              <div className="muscle-map__legend-header">
                <span
                  className="muscle-map__tone-dot"
                  aria-hidden="true"
                  style={{ background: ST[block.tone].stroke }}
                />
                <span className="muscle-map__legend-title">{block.title}</span>
              </div>
              <p className="muscle-map__legend-items">{block.items}</p>
            </div>
          ))}

          {/* Coach hint */}
          {coachHint != null ? (
            <div className="muscle-map__coach-hint">
              <Icon name="spark" size={14} stroke={tokens.color.metric.green} aria-hidden />
              <span className="muscle-map__coach-hint-text">{coachHint}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Disclaimer — CONTENT FLOOR, always rendered */}
      <MedicalNote className="muscle-map__disclaimer">
        {DEFAULT_DISCLAIMER}
      </MedicalNote>
    </Card>
  );
}
