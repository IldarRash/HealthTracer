export const authAppearance = {
  variables: {
    colorPrimary: "#19c37d",
    colorText: "#0e0e0d",
    colorTextSecondary: "#76766f",
    colorBackground: "#ffffff",
    colorInputBackground: "#f9f9f8",
    colorInputText: "#0e0e0d",
    borderRadius: "1rem",
    fontFamily: '"Helvetica Neue", Helvetica, "Segoe UI", system-ui, -apple-system, sans-serif',
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
