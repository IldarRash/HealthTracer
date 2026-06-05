/**
 * Cross-platform design tokens for AI Health Coach.
 * Web maps these to CSS custom properties in apps/web/app/styles.css.
 * Mobile should mirror semantic names when NativeWind tokens are added.
 *
 * Visual direction: two worlds — LIGHT (chat / profile / onboarding / billing)
 * and DARK (today / longevity / plans). Shared metric color scale. Coach accent
 * is now a green (#19c37d) palette, replacing the old teal scale. Surface/text/
 * border/shadow vars are scoped by [data-theme] in CSS; tokens.ts mirrors them
 * as dark-world defaults (legacy callers) while light-world values live in the
 * `color.light` group.
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
    /** Wellness coach accent — primary actions, links, metrics, focus rings. Green palette. */
    coach: {
      50: "#f0fbf6",
      100: "rgba(25,195,125,0.16)",
      400: "#3ddc94",
      500: "#19c37d",
      600: "#19c37d",
      700: "#15a76b",
    },
    /** Semantic metric scale — shared between light and dark worlds. */
    metric: {
      green: "#19c37d",
      greenDim: "rgba(25,195,125,0.16)",
      amber: "#f5a524",
      amberDim: "rgba(245,165,36,0.16)",
      red: "#f0506a",
      redDim: "rgba(240,80,106,0.16)",
      blue: "#3a8dff",
      blueDim: "rgba(58,141,255,0.16)",
      indigo: "#7b7bff",
      indigoDim: "rgba(123,123,255,0.16)",
    },
    surface: {
      /** App canvas — dark world default. */
      app: "#0b0d0e",
      card: "#131618",
      muted: "#1a1e21",
      inset: "#131618",
      elevated: "#20262a",
      /** Dark nav strip / mobile tab bar. */
      nav: "#0e1113",
      navHover: "#1e1e1e",
      navActive: "#262626",
      /** Profile hero anchor card. */
      heroDark: "#131618",
      /** Light content canvas tokens — for routes that use light theme. */
      content: "#f9f9f8",
      contentElevated: "#ffffff",
      contentMuted: "#f3f3f1",
    },
    /** Light-world surface/text/border raw values (mirrors CSS [data-theme="light"] block). */
    light: {
      bg: "#ffffff",
      panel: "#f9f9f8",
      panel2: "#f3f3f1",
      line: "#ececea",
      line2: "#e2e2df",
      ink: "#0e0e0d",
      ink2: "#3b3b38",
      mut: "#76766f",
      mut2: "#9a9a92",
    },
    /** Dark-world surface/text/border raw values (mirrors CSS [data-theme="dark"] block). */
    dark: {
      bg: "#0b0d0e",
      panel: "#131618",
      panel2: "#1a1e21",
      elev: "#20262a",
      line: "rgba(255,255,255,0.075)",
      line2: "rgba(255,255,255,0.14)",
      ink: "#f3f5f6",
      ink2: "#cfd4d7",
      mut: "#878d92",
      mut2: "#5e656a",
    },
    text: {
      primary: "#f3f5f6",
      secondary: "#cfd4d7",
      muted: "#878d92",
      inverse: "#0b0d0e",
      onDark: "#f3f5f6",
      nav: "#f3f5f6",
      navMuted: "#878d92",
      /** Text on light content surfaces when used. */
      onLight: "#0e0e0d",
      onLightSecondary: "#3b3b38",
    },
    border: {
      default: "rgba(255,255,255,0.075)",
      strong: "rgba(255,255,255,0.14)",
      focus: "#19c37d",
      /** Light-surface borders from visual direction. */
      subtle: "#ececea",
      strongLight: "#e2e2df",
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
    /** Dark-theme card elevation. */
    card: "0 1px 3px rgb(0 0 0 / 35%), 0 8px 24px rgb(0 0 0 / 25%)",
    /** Light-surface card shadow. */
    cardLight: "0 1px 3px rgb(0 0 0 / 8%), 0 4px 16px rgb(0 0 0 / 6%)",
    elevated: "0 24px 60px rgb(0 0 0 / 45%)",
    composer: "0 -4px 24px rgb(0 0 0 / 8%)",
    focus: "0 0 0 3px rgb(25 195 125 / 28%)",
    brandSoft: "0 8px 24px rgb(25 195 125 / 18%)",
  },
  focus: {
    width: "2px",
    color: "#19c37d",
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
  /** Chat transcript surfaces — themed per world. */
  chat: {
    bubble: {
      user: {
        bg: "#f0fbf6",
        border: "rgba(25,195,125,0.35)",
        text: "#15a76b",
      },
      assistant: {
        bg: "#131618",
        border: "rgba(255,255,255,0.075)",
        text: "#f3f5f6",
        accent: "#3ddc94",
      },
      crisis: {
        bg: "#131618",
        border: "#fca5a5",
        accent: "#b91c1c",
      },
    },
    metadata: {
      neutral: { bg: "#131618", border: "rgba(255,255,255,0.075)", text: "#cfd4d7" },
      notice: { bg: "#fff7ed", border: "#fed7aa", text: "#9a3412" },
      crisis: { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b" },
    },
    promptChip: {
      bg: "#131618",
      border: "rgba(255,255,255,0.14)",
      text: "#cfd4d7",
      hoverBorder: "#19c37d",
      hoverText: "#15a76b",
    },
  },
  /** Premium overview cards — dark hero on light canvas, read-only trend sections. */
  overview: {
    hero: {
      surface: "#131618",
      text: "#f3f5f6",
      textMuted: "rgb(243 245 246 / 72%)",
    },
    card: {
      surface: "#ffffff",
      surfaceMuted: "#f3f3f1",
      border: "#ececea",
      shadow: "0 1px 3px rgb(0 0 0 / 8%), 0 4px 16px rgb(0 0 0 / 6%)",
    },
    coachCard: {
      border: "rgba(25,195,125,0.45)",
      shadow: "0 8px 24px rgb(25 195 125 / 18%)",
    },
    trend: {
      barBg: "rgb(255 255 255 / 14%)",
      barBgSparse: "rgb(255 255 255 / 8%)",
      fill: "#19c37d",
    },
  },
  font: {
    sans: '"Helvetica Neue", Helvetica, "Segoe UI", system-ui, -apple-system, sans-serif',
    mono: '"SF Mono", ui-monospace, "Roboto Mono", Menlo, monospace',
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
  surfaceContent: "--color-surface-content",
  surfaceContentElevated: "--color-surface-content-elevated",
  textOnLight: "--color-text-on-light",
  textOnLightSecondary: "--color-text-on-light-secondary",
  borderSubtle: "--color-border-subtle",
  borderStrongLight: "--color-border-strong-light",
  accentPrimary: "--color-accent-primary",
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
  chatBubbleUserBg: "--color-chat-bubble-user-bg",
  chatBubbleUserBorder: "--color-chat-bubble-user-border",
  chatBubbleAssistantBg: "--color-chat-bubble-assistant-bg",
  chatBubbleAssistantBorder: "--color-chat-bubble-assistant-border",
  chatBubbleCoachAccent: "--color-chat-bubble-coach-accent",
  chatMetadataNoticeBg: "--color-chat-metadata-notice-bg",
  chatMetadataCrisisBg: "--color-chat-metadata-crisis-bg",
  chatMetadataCrisisBorder: "--color-chat-metadata-crisis-border",
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
