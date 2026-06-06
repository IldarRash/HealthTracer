/**
 * LoadingScreen — dark-world full-content placeholder per screen layout.
 * layout: 'longevity' — 1 tall + 3 equal + 2 cards (1.3/1)
 * layout: 'plan'      — 1 + 2 cards (1.4/1) + 1 tall
 *
 * Replaces the generic LoadingState on the three redesigned screens.
 */

"use client";

import { type ReactElement } from "react";
import { SkeletonCard } from "./skeleton";

export type LoadingScreenLayout = "longevity" | "plan";

export type LoadingScreenProps = {
  label?: string;
  layout?: LoadingScreenLayout;
};

export function LoadingScreen({
  label = "Loading",
  layout = "longevity",
}: LoadingScreenProps): ReactElement {
  return (
    <div
      className="ds-loading-screen"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`${label}…`}
    >
      {/* Header: spinner + label */}
      <div className="ds-loading-screen__header">
        <span className="ds-loading-screen__spinner" aria-hidden="true" />
        <span className="ds-loading-screen__label">{label}…</span>
      </div>

      {layout === "longevity" ? (
        <>
          {/* Tall hero card */}
          <SkeletonCard h={120} />

          {/* 3 equal domain cards */}
          <div className="ds-loading-screen__row">
            <div style={{ flex: 1 }}>
              <SkeletonCard h={70} />
            </div>
            <div style={{ flex: 1 }}>
              <SkeletonCard h={70} />
            </div>
            <div style={{ flex: 1 }}>
              <SkeletonCard h={70} />
            </div>
          </div>

          {/* 2 cards — 1.3 / 1 */}
          <div className="ds-loading-screen__row">
            <div style={{ flex: "1.3 1 0" }}>
              <SkeletonCard h={130} />
            </div>
            <div style={{ flex: "1 1 0" }}>
              <SkeletonCard h={130} />
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Plan header card */}
          <SkeletonCard h={90} />

          {/* 2 cards — 1.4 / 1 */}
          <div className="ds-loading-screen__row">
            <div style={{ flex: "1.4 1 0" }}>
              <SkeletonCard h={150} />
            </div>
            <div style={{ flex: "1 1 0" }}>
              <SkeletonCard h={150} />
            </div>
          </div>

          {/* Tall session card */}
          <SkeletonCard h={160} />
        </>
      )}
    </div>
  );
}
