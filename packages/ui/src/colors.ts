import { tokens } from "./tokens";

export const colors = {
  background: tokens.color.surface.app,
  foreground: tokens.color.text.primary,
  /** Primary coaching accent — prefer over legacy brand blue. */
  primary: tokens.color.coach[600],
  primaryHover: tokens.color.coach[700],
  primarySubtle: tokens.color.coach[100],
} as const;
