/**
 * Skeleton primitives — dark-world shimmer placeholders.
 * Sk / SkLines / SkCard map to the design's Sk/SkLines/SkCard from states.jsx.
 * The shimmer keyframe (htShimmer) and .ds-skeleton class live in styles.css.
 */

import { type CSSProperties, type ReactElement } from "react";

// ── Skeleton block ──────────────────────────────────────────────

export type SkeletonProps = {
  /** Width — CSS value or px number (defaults to "100%"). */
  w?: number | string;
  /** Height in px (defaults to 14). */
  h?: number;
  /** Border radius in px (defaults to 7). */
  r?: number;
  className?: string;
  style?: CSSProperties;
};

export function Skeleton({ w = "100%", h = 14, r = 7, className, style }: SkeletonProps): ReactElement {
  return (
    <div
      className={`ds-skeleton${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      style={{
        width: typeof w === "number" ? w : w,
        height: h,
        borderRadius: r,
        ...style,
      }}
    />
  );
}

// ── SkeletonLines — n stacked skeleton bars ──────────────────────

export type SkeletonLinesProps = {
  /** Number of lines (defaults to 3). */
  n?: number;
  /** Gap between lines in px (defaults to 9). */
  gap?: number;
  /** Width of the last line — CSS value (defaults to "60%"). */
  last?: string;
};

export function SkeletonLines({ n = 3, gap = 9, last = "60%" }: SkeletonLinesProps): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }} aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} h={11} w={i === n - 1 ? last : "100%"} />
      ))}
    </div>
  );
}

// ── SkeletonCard — card-shaped skeleton (optional header) ─────────

export type SkeletonCardProps = {
  /** Inner content height in px (defaults to 150). */
  h?: number;
  /** Show a head row (icon + title bar) above the block (defaults to true). */
  head?: boolean;
  /** Card padding in px (defaults to 18). */
  pad?: number;
  className?: string;
};

export function SkeletonCard({ h = 150, head = true, pad = 18 }: SkeletonCardProps): ReactElement {
  return (
    <div className="ds-skeleton-card" aria-hidden="true">
      {head && (
        <div className="ds-skeleton-card__head">
          <Skeleton w={26} h={26} r={8} />
          <Skeleton w={130} h={12} />
        </div>
      )}
      <div className="ds-skeleton-card__body" style={{ paddingTop: head ? 12 : pad }}>
        <Skeleton h={h} r={12} />
      </div>
    </div>
  );
}
