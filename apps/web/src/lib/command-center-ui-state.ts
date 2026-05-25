/**
 * Presentation-only helpers for command-center status badges.
 * Domain modules keep their own label/copy helpers; these map to shared badge classes.
 */

export type SessionStatusKey = "planned" | "completed" | "skipped" | "pending";

export function sessionStatusBadgeClass(status: SessionStatusKey): string {
  return `badge badge-session-${status}`;
}

export function semanticStatusBadgeClass(
  tone: "pending" | "success" | "error" | "info" | "neutral",
): string {
  switch (tone) {
    case "pending":
      return "badge badge-pending";
    case "success":
      return "badge badge-valid";
    case "error":
      return "badge badge-invalid";
    case "info":
      return "badge badge-info";
    case "neutral":
      return "badge badge-neutral";
  }
}

export function canvasStateMessageClass(tone: "empty" | "loading" | "error"): string {
  return `state-message state-message--${tone} state-message--canvas`;
}

export function canvasStateMessageCompactClass(tone: "empty" | "loading" | "error"): string {
  return `${canvasStateMessageClass(tone)} state-message--canvas-compact`;
}
