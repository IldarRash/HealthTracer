import type { ReactNode } from "react";
import { AppNav } from "./app-nav";
import { AppShell, AppShellHeader, AppShellMain } from "./ui";

type AppLayoutProps = {
  children: ReactNode;
  variant?: "default" | "chat" | "dashboard";
};

export function AppLayout({ children, variant = "default" }: AppLayoutProps) {
  return (
    <AppShell variant={variant === "chat" ? "chat" : "default"}>
      <AppShellHeader brand="AI Health Coach" nav={<AppNav />} />
      <AppShellMain
        variant={
          variant === "chat" ? "chat" : variant === "dashboard" ? "dashboard" : "default"
        }
      >
        {children}
      </AppShellMain>
    </AppShell>
  );
}
