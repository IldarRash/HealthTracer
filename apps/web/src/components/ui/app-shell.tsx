import { type HTMLAttributes, type ReactNode } from "react";
import type { AppShellMainVariant } from "../../lib/shell-ui-state";
import { cn } from "../../lib/utils";

type AppShellProps = HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "chat";
};

export function AppShell({ variant = "default", className, ...props }: AppShellProps) {
  return (
    <div
      className={cn("app-shell", variant === "chat" && "app-shell--chat", className)}
      {...props}
    />
  );
}

type AppShellHeaderProps = HTMLAttributes<HTMLElement> & {
  brand?: ReactNode;
  nav?: ReactNode;
  actions?: ReactNode;
};

export function AppShellHeader({ brand, nav, actions, className, ...props }: AppShellHeaderProps) {
  return (
    <header className={cn("app-shell__header", className)} {...props}>
      {brand ? <div className="app-shell__brand">{brand}</div> : null}
      {nav ? <div className="app-shell__nav">{nav}</div> : null}
      {actions ? <div className="app-shell__actions">{actions}</div> : null}
    </header>
  );
}

type AppShellMainProps = HTMLAttributes<HTMLElement> & {
  variant?: AppShellMainVariant;
};

export function AppShellMain({ variant = "structured", className, ...props }: AppShellMainProps) {
  return (
    <main
      className={cn(
        "app-shell__main",
        variant === "chat" && "app-shell__main--chat",
        variant === "structured" && "app-shell__main--structured",
        className,
      )}
      {...props}
    />
  );
}

type PageHeaderProps = HTMLAttributes<HTMLElement> & {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, className, ...props }: PageHeaderProps) {
  return (
    <header className={cn("page-header", className)} {...props}>
      {eyebrow ? <p className="page-header__eyebrow">{eyebrow}</p> : null}
      <h1 className="page-header__title">{title}</h1>
      {description ? <p className="page-header__description">{description}</p> : null}
    </header>
  );
}

type PageContentProps = HTMLAttributes<HTMLDivElement>;

export function PageContent({ className, ...props }: PageContentProps) {
  return <div className={cn("page-content", className)} {...props} />;
}
