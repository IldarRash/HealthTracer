import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";

type DashboardCardProps = HTMLAttributes<HTMLElement> & {
  label?: string;
  title: string;
  value?: ReactNode;
  hint?: ReactNode;
  footer?: ReactNode;
};

export function DashboardCard({
  label,
  title,
  value,
  hint,
  footer,
  className,
  children,
  ...props
}: DashboardCardProps) {
  return (
    <article className={cn("dashboard-card", className)} {...props}>
      {label ? <p className="dashboard-card__label">{label}</p> : null}
      <h3 className="dashboard-card__title">{title}</h3>
      {value ? <div className="dashboard-card__value">{value}</div> : null}
      {hint ? <p className="dashboard-card__hint">{hint}</p> : null}
      {children ? <div className="dashboard-card__body">{children}</div> : null}
      {footer ? <footer className="dashboard-card__footer">{footer}</footer> : null}
    </article>
  );
}

type DashboardGridProps = HTMLAttributes<HTMLDivElement>;

export function DashboardGrid({ className, ...props }: DashboardGridProps) {
  return <div className={cn("dashboard-grid", className)} {...props} />;
}
