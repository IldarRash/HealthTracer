import { tokens } from "./tokens";

export const colors = {
  background: tokens.color.surface.app,
  foreground: tokens.color.text.primary,
  primary: tokens.color.brand[500],
} as const;
