/**
 * PlayBadge + MediaCard — dark-world "watchable" cards for exercises and recipes.
 *
 * PlayBadge: circular translucent play overlay (from design states.jsx).
 * MediaCard:  132px poster with deterministic CSS-gradient (6 variants by poster index)
 *             + large translucent icon + centered PlayBadge + duration badge + optional
 *             "done" chip. Footer: title 14/700 + meta + tag chips.
 *
 * Keyboard accessible: role=button, tabIndex=0, Enter/Space triggers onOpen.
 */

import { type KeyboardEvent, type ReactElement } from "react";
import { Icon, type IconName } from "./icon";

// ── PlayBadge ──────────────────────────────────────────────────

export type PlayBadgeProps = {
  /** Diameter in px (defaults to 46). */
  size?: number;
  /** Play triangle fill color (defaults to #fff). */
  color?: string;
};

export function PlayBadge({ size = 46, color = "#fff" }: PlayBadgeProps): ReactElement {
  const triSize = size * 0.4;
  const triOffset = size * 0.05;
  return (
    <div
      className="ds-play-badge"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <svg
        width={triSize}
        height={triSize}
        viewBox="0 0 24 24"
        fill={color}
        style={{ marginLeft: triOffset }}
      >
        <path d="M7 4.5v15l13-7.5z" />
      </svg>
    </div>
  );
}

// ── Poster gradient palette (6 deterministic dark gradients) ─────

const POSTER_GRADIENTS = [
  "linear-gradient(135deg, #1c2733, #0f1518)",
  "linear-gradient(135deg, #25201c, #14110e)",
  "linear-gradient(135deg, #1b2620, #0f1613)",
  "linear-gradient(135deg, #221c2b, #120f17)",
  "linear-gradient(135deg, #2a1c20, #160e10)",
  "linear-gradient(135deg, #1c2330, #0e1218)",
] as const;

// ── MediaCard ──────────────────────────────────────────────────

export type MediaCardKind = "exercise" | "recipe";

export type MediaCardProps = {
  kind?: MediaCardKind;
  /** Accent color used for the large icon (defaults to metric-blue). */
  color?: string;
  /** Icon name for the large background glyph (defaults to "dumbbell"). */
  icon?: IconName;
  title: string;
  /** Secondary descriptor (e.g. "4×8 reps · 60s rest"). */
  meta?: string;
  /** Duration label shown top-right (e.g. "3 min"). */
  duration?: string;
  /** Tag strings shown as chips in the footer. */
  tags?: readonly string[];
  /** Index 0–∞ — determines the poster gradient (loops over 6). */
  poster?: number;
  /** Whether this card shows a "done" chip. */
  done?: boolean;
  /** Called when the card is activated (click or Enter/Space). */
  onOpen?: () => void;
  className?: string;
};

export function MediaCard({
  kind = "exercise",
  color = "var(--color-metric-blue)",
  icon = kind === "recipe" ? "fork" : "dumbbell",
  title,
  meta,
  duration,
  tags,
  poster = 0,
  done = false,
  onOpen,
  className,
}: MediaCardProps): ReactElement {
  const gradient = POSTER_GRADIENTS[poster % POSTER_GRADIENTS.length];

  function handleKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen?.();
    }
  }

  return (
    <div
      className={`ds-media-card${className ? ` ${className}` : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${title}${duration ? `, ${duration}` : ""}${done ? ", done" : ""}`}
      onClick={onOpen}
      onKeyDown={handleKey}
    >
      {/* Poster */}
      <div
        className="ds-media-card__poster"
        style={{ background: gradient }}
      >
        {/* Large translucent icon */}
        <Icon
          name={icon}
          size={48}
          stroke={color}
          sw={1.4}
          className="ds-media-card__poster-icon"
        />

        {/* Centered play badge */}
        <div className="ds-media-card__play-overlay">
          <PlayBadge />
        </div>

        {/* Duration badge — top-right */}
        {duration ? (
          <div className="ds-media-card__duration" aria-hidden="true">
            {duration}
          </div>
        ) : null}

        {/* Done chip — top-left */}
        {done ? (
          <div className="ds-media-card__done-chip" aria-hidden="true">
            <Icon name="checkSm" size={11} stroke="var(--color-metric-green)" sw={2.6} />
            done
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="ds-media-card__footer">
        <p className="ds-media-card__title">{title}</p>
        {meta ? <p className="ds-media-card__meta">{meta}</p> : null}
        {tags && tags.length > 0 ? (
          <div className="ds-media-card__tags" aria-label="Tags">
            {tags.map((tag) => (
              <span key={tag} className="ds-media-card__tag">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
