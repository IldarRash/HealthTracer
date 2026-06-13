import type { ReactNode } from "react";

/**
 * Shared section card used on /sleep and /pulse (mirrors biomarkers workspace
 * card style). Accepts a title, optional aria-label, and child content.
 */
export function SectionCard({
  title,
  children,
  ariaLabel,
}: {
  title: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <section
      aria-label={ariaLabel ?? title}
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 16,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          margin: 0,
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}
