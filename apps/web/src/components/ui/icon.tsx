/**
 * Icon — single-stroke SVG icon component backed by the design kit path set.
 * Paths ported from docs/design/app/kit.jsx ICONS object.
 */

export const ICONS = {
  chat: "M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 3.5V15H6.5A2.5 2.5 0 0 1 4 12.5z",
  today: "M4 7h16M4 12h16M4 17h10M7 3v3M17 3v3",
  longevity: "M4 19V5M4 19h16M8 15l3-4 3 3 4-6",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0",
  dumbbell: "M6.5 7v10M3.5 9v6M17.5 7v10M20.5 9v6M6.5 12h11",
  fork: "M6 3v7a2 2 0 0 0 4 0V3M8 12v9M17 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4 2.5-2.5 0-5M17 12v9",
  moon: "M19 13.5A7.5 7.5 0 0 1 10.5 5a7.5 7.5 0 1 0 8.5 8.5Z",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z",
  heart: "M12 20s-7-4.6-7-9.5A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7-2.5C19 10 12 20 12 20Z",
  check: "M4 12.5 9 17.5 20 6.5",
  checkSm: "M3 8.5 6.5 12 13 4.5",
  x: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  edit: "M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17z",
  send: "M5 12h13M12 5l7 7-7 7",
  arrow: "M5 12h14M13 6l6 6-6 6",
  camera:
    "M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.2-2h5.6L16 7h2.5A1.5 1.5 0 0 1 20 8.5v8A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5zM12 15.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  clip: "M19 11l-7.5 7.5a4 4 0 0 1-5.7-5.7L13 5.5a2.6 2.6 0 0 1 3.7 3.7l-7.2 7.2a1.2 1.2 0 0 1-1.7-1.7L14 8",
  spark:
    "M12 3v3M12 18v3M5 12H2M22 12h-3M6 6l2 2M18 6l-2 2M6 18l2-2M18 18l-2-2",
  shield: "M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z",
  bolt: "M13 3 5 13h6l-1 8 8-10h-6z",
  lock: "M6 11V8a6 6 0 0 1 12 0v3M5 11h14v9H5z",
  bed: "M3 18v-6a2 2 0 0 1 2-2h11a3 3 0 0 1 3 3v5M3 14h18M3 18v2M21 17v3M7 10V8",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  doc: "M7 3h7l4 4v14H7zM14 3v4h4",
  chevR: "M9 5l7 7-7 7",
  chevD: "M5 9l7 7 7-7",
  info: "M12 16v-5M12 8h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  star: "M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6L12 16.8 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z",
  pause: "M9 5v14M15 5v14",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M6 6 4.5 4.5M19.5 19.5 18 18M6 18l-1.5 1.5M19.5 4.5 18 6M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
} as const;

export type IconName = keyof typeof ICONS;

export type IconProps = {
  name: IconName;
  size?: number;
  stroke?: string;
  /** Stroke width — defaults to 1.7 (inactive). Use 2 for active state. */
  sw?: number;
  fill?: string;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
};

export function Icon({
  name,
  size = 20,
  stroke = "currentColor",
  sw = 1.7,
  fill = "none",
  className,
  "aria-hidden": ariaHidden = true,
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, display: "block" }}
      aria-hidden={ariaHidden}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/**
 * Brand mark — concentric ring (recovery-ring vibe) from kit.jsx.
 * Rendered as an SVG, not using the ICONS path set.
 */
export type MarkProps = {
  size?: number;
  color?: string;
};

export function Mark({ size = 26, color = "#19c37d" }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden
    >
      <circle
        cx="14"
        cy="14"
        r="11"
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        opacity="0.28"
      />
      <path
        d="M14 3a11 11 0 0 1 9.5 5.5"
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="14" cy="14" r="3.4" fill={color} />
    </svg>
  );
}
