/**
 * Cross-platform design tokens for AI Health Coach.
 * Web maps these to CSS custom properties in apps/web/app/styles.css.
 * Mobile should mirror semantic names when NativeWind tokens are added.
 */
export const tokens = {
  color: {
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
    surface: {
      app: "#f4f7fb",
      card: "#ffffff",
      muted: "#f1f5f9",
      inset: "#f8fafc",
      elevated: "#ffffff",
    },
    text: {
      primary: "#0f172a",
      secondary: "#475569",
      muted: "#64748b",
      inverse: "#ffffff",
    },
    border: {
      default: "#e2e8f0",
      strong: "#cbd5e1",
      focus: "#2563eb",
    },
    status: {
      pending: { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" },
      success: { bg: "#dcfce7", text: "#166534", border: "#86efac" },
      error: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
      info: { bg: "#eff6ff", text: "#1d4ed8", border: "#93c5fd" },
      neutral: { bg: "#e2e8f0", text: "#334155", border: "#cbd5e1" },
    },
  },
  radius: {
    sm: "0.5rem",
    md: "0.75rem",
    lg: "1rem",
    xl: "1.5rem",
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
    contentMax: "64rem",
    chatMax: "48rem",
    navHeight: "3.5rem",
  },
  shadow: {
    card: "0 1px 3px rgb(15 23 42 / 6%), 0 8px 24px rgb(15 23 42 / 6%)",
    elevated: "0 24px 60px rgb(15 23 42 / 8%)",
    focus: "0 0 0 3px rgb(37 99 235 / 18%)",
  },
  font: {
    sans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
} as const;

export type StatusTone = "pending" | "success" | "error" | "info" | "neutral";

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
