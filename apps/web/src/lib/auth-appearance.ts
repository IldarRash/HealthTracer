export const authAppearance = {
  variables: {
    colorPrimary: "#0d9488",
    colorText: "#111827",
    colorTextSecondary: "#5c5c58",
    colorBackground: "#ffffff",
    colorInputBackground: "#f7f7f5",
    colorInputText: "#111827",
    borderRadius: "1rem",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  },
  elements: {
    rootBox: "auth-clerk-root",
    card: "auth-clerk-card",
    headerTitle: "auth-clerk-title",
    headerSubtitle: "auth-clerk-subtitle",
    formButtonPrimary: "auth-clerk-primary",
    socialButtonsBlockButton: "auth-clerk-social",
    formFieldInput: "auth-clerk-input",
    footerActionLink: "auth-clerk-link",
  },
} as const;
