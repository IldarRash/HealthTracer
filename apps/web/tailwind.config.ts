import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--color-surface-app)",
        foreground: "var(--color-text-primary)",
        card: "var(--color-surface-card)",
        border: "var(--color-border-default)",
        primary: {
          DEFAULT: "var(--color-brand-500)",
          foreground: "var(--color-text-inverse)",
        },
        muted: {
          DEFAULT: "var(--color-surface-muted)",
          foreground: "var(--color-text-muted)",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        elevated: "var(--shadow-elevated)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
      },
      maxWidth: {
        shell: "var(--layout-shell-max)",
        content: "var(--layout-content-max)",
        chat: "var(--layout-chat-max)",
      },
    },
  },
};

export default config;
