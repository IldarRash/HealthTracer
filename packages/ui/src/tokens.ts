/**
 * Cross-platform design tokens for AI Health Coach.
 * Web maps these to CSS custom properties in apps/web/app/styles.css.
 * Mobile should mirror semantic names when NativeWind tokens are added.
 *
 * Visual direction: dark/high-contrast shell, coach teal accent, metric-forward
 * cards — see docs/design/chat-primary-web-visual-direction.md.
 */
export const tokens = {
  color: {
    /** Legacy brand blue — prefer coach for primary coaching actions. */
    brand: {
      50: "#eff6ff",
      100: "#dbeafe",
      200: "#bfdbfe",
      300: "#93c5fd",
      400: "#60a5fa",
      500: "#2563eb",
      600: "#1d4ed8",
      700: "#1e40af",
      800: "#1e3a8a",
      900: "#172554",
    },
    /** Wellness coach accent — primary actions, links, metrics, focus rings. */
    coach: {
      50: "#f0fdfa",
      100: "#ccfbf1",
      400: "#2dd4bf",
      500: "#14b8a6",
      600: "#0d9488",
      700: "#0f766e",
    },
    surface: {
      /** App canvas — dark shell default in current web pass. */
      app: "#0a0a0a",
      card: "#141414",
      muted: "#1c1c1c",
      inset: "#111111",
      elevated: "#1a1a1a",
      /** Dark nav strip / mobile tab bar. */
      nav: "#121212",
      navHover: "#1e1e1e",
      navActive: "#262626",
      /** Profile hero anchor card. */
      heroDark: "#1a1a1a",
      /** Light content canvas tokens — for routes that migrate to light panels. */
      content: "#f7f7f5",
      contentElevated: "#ffffff",
      contentMuted: "#f0f0ed",
    },
    text: {
      primary: "#f5f5f3",
      secondary: "#c8c8c4",
      muted: "#9a9a96",
      inverse: "#0a0a0a",
      onDark: "#f5f5f3",
      nav: "#ececea",
      navMuted: "#9a9a96",
      /** Text on light content surfaces when used. */
      onLight: "#0f0f0f",
      onLightSecondary: "#5c5c58",
    },
    border: {
      default: "#2a2a2a",
      strong: "#3a3a3a",
      focus: "#2dd4bf",
      /** Light-surface borders from visual direction. */
      subtle: "#e5e5e0",
      strongLight: "#d4d4ce",
    },
    status: {
      pending: { bg: "#fef3c7", text: "#d97706", border: "#fcd34d" },
      success: { bg: "#dcfce7", text: "#15803d", border: "#86efac" },
      error: { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
      info: { bg: "#eff6ff", text: "#1d4ed8", border: "#93c5fd" },
      neutral: { bg: "#e2e8f0", text: "#334155", border: "#cbd5e1" },
    },
  },
  radius: {
    sm: "0.5rem",
    md: "0.75rem",
    lg: "1rem",
    xl: "1.5rem",
    composer: "1.25rem",
    full: "9999px",
  },
  space: {
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
    12: "3rem",
  },
  layout: {
    shellMax: "80rem",
    contentMax: "72rem",
    chatMax: "48rem",
    navHeight: "3.5rem",
    touchTargetMin: "2.75rem",
  },
  shadow: {
    /** Dark-theme card elevation (current web shell). */
    card: "0 1px 3px rgb(0 0 0 / 35%), 0 8px 24px rgb(0 0 0 / 25%)",
    /** Light-surface card from visual direction. */
    cardLight: "0 1px 2px rgb(0 0 0 / 4%), 0 4px 16px rgb(0 0 0 / 6%)",
    elevated: "0 24px 60px rgb(0 0 0 / 45%)",
    composer: "0 -4px 24px rgb(0 0 0 / 8%)",
    focus: "0 0 0 3px rgb(45 212 191 / 28%)",
    brandSoft: "0 8px 24px rgb(20 184 166 / 18%)",
  },
  focus: {
    width: "2px",
    color: "#2dd4bf",
    offset: "2px",
  },
  typography: {
    pageTitle: { size: "1.5rem", weight: 600, letterSpacing: "-0.02em" },
    chat: { size: "0.9375rem", lineHeight: 1.6 },
    sectionLabel: {
      size: "0.6875rem",
      weight: 700,
      letterSpacing: "0.08em",
      transform: "uppercase" as const,
    },
    metricHero: { sizeMin: "2.5rem", sizeMax: "3rem", weight: 600 },
    meta: { size: "0.8125rem" },
  },
  font: {
    sans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
} as const;

/** Maps semantic token paths to web CSS custom property names. */
export const cssVar = {
  coach50: "--color-coach-50",
  coach100: "--color-coach-100",
  coach400: "--color-coach-400",
  coach500: "--color-coach-500",
  coach600: "--color-coach-600",
  coach700: "--color-coach-700",
  surfaceApp: "--color-surface-app",
  surfaceCard: "--color-surface-card",
  surfaceMuted: "--color-surface-muted",
  surfaceNav: "--color-surface-sidebar",
  surfaceHeroDark: "--color-surface-hero-dark",
  textPrimary: "--color-text-primary",
  textSecondary: "--color-text-secondary",
  textMuted: "--color-text-muted",
  textNav: "--color-text-sidebar",
  borderDefault: "--color-border-default",
  borderFocus: "--color-border-focus",
  shadowCard: "--shadow-card",
  shadowComposer: "--shadow-composer",
  shadowFocus: "--shadow-focus",
  layoutChatMax: "--layout-chat-max",
  layoutContentMax: "--layout-content-max",
  layoutNavHeight: "--layout-nav-height",
  focusOutline: "--focus-outline",
  focusOutlineOffset: "--focus-outline-offset",
  touchTargetMin: "--touch-target-min",
} as const;

/** Returns a CSS `var(...)` reference for a mapped custom property. */
export function tokenVar(name: keyof typeof cssVar): string {
  return `var(${cssVar[name]})`;
}

export type StatusTone = "pending" | "success" | "error" | "info" | "neutral";

export type PrivacyStatus =
  | "not_connected"
  | "consent_required"
  | "active"
  | "paused"
  | "revoked"
  | "unavailable";

export type ProposalDomain = "workout" | "goal" | "nutrition" | "recipe" | "profile";

export const proposalStatusTone: Record<string, StatusTone> = {
  pending: "pending",
  pending_validation: "pending",
  accepted: "success",
  valid: "success",
  rejected: "error",
  invalid: "error",
  superseded: "neutral",
};

export const sessionStatusTone: Record<string, StatusTone> = {
  planned: "info",
  completed: "success",
  skipped: "neutral",
};

export const privacyStatusTone: Record<PrivacyStatus, StatusTone> = {
  not_connected: "neutral",
  consent_required: "pending",
  active: "success",
  paused: "info",
  revoked: "error",
  unavailable: "neutral",
};

export const privacyStatusLabel: Record<PrivacyStatus, string> = {
  not_connected: "Not connected",
  consent_required: "Consent needed",
  active: "Sync active",
  paused: "Sync paused",
  revoked: "Access revoked",
  unavailable: "Unavailable",
};

/** Domain pill colors for inline proposal confirmation cards. */
export const proposalDomainTone: Record<
  ProposalDomain,
  { bg: string; text: string; cssClass: string }
> = {
  workout: {
    bg: tokens.color.coach[100],
    text: tokens.color.coach[700],
    cssClass: "proposal-domain-pill--workout",
  },
  goal: {
    bg: tokens.color.status.pending.bg,
    text: tokens.color.status.pending.text,
    cssClass: "proposal-domain-pill--goal",
  },
  nutrition: {
    bg: tokens.color.status.success.bg,
    text: tokens.color.status.success.text,
    cssClass: "proposal-domain-pill--nutrition",
  },
  recipe: {
    bg: tokens.color.status.info.bg,
    text: tokens.color.brand[800],
    cssClass: "proposal-domain-pill--recipe",
  },
  profile: {
    bg: tokens.color.status.neutral.bg,
    text: tokens.color.status.neutral.text,
    cssClass: "proposal-domain-pill--profile",
  },
};

/** Human-readable proposal domain labels — no API snake_case in UI. */
export const proposalDomainLabel: Record<ProposalDomain, string> = {
  workout: "Workout",
  goal: "Goal",
  nutrition: "Nutrition",
  recipe: "Recipe",
  profile: "Profile",
};
