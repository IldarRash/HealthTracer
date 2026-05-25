import type { ReactNode } from "react";
import type { AppLayoutVariant } from "../lib/shell-ui-state";
import { AppLayoutClient } from "./app-layout-client";
import { OnboardingGate } from "./onboarding/onboarding-gate";

type AppLayoutProps = {
  children: ReactNode;
  variant?: AppLayoutVariant;
};

export function AppLayout({ children, variant = "default" }: AppLayoutProps) {
  return (
    <AppLayoutClient variant={variant}>
      <OnboardingGate>{children}</OnboardingGate>
    </AppLayoutClient>
  );
}
