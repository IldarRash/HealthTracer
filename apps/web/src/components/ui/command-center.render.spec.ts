import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sessionStatusBadgeClass } from "../../lib/command-center-ui-state.js";

const commandCenterSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "command-center.tsx"),
  "utf8",
);

describe("CommandCenter source contracts", () => {
  it("renders accessible section navigation anchors", () => {
    expect(commandCenterSource).toContain('aria-label={ariaLabel}');
    expect(commandCenterSource).toContain('href={`#${section.id}`}');
    expect(commandCenterSource).toContain('className="section-nav__link"');
  });

  it("defines priority, domain, disclosure, and canvas state wrappers", () => {
    expect(commandCenterSource).toContain("ActionPriorityCard");
    expect(commandCenterSource).toContain("CompactDomainCard");
    expect(commandCenterSource).toContain("<details");
    expect(commandCenterSource).toContain("useState(defaultOpen)");
    expect(commandCenterSource).toContain("open={open}");
    expect(commandCenterSource).toContain("onToggle");
    expect(commandCenterSource).not.toMatch(/open=\{defaultOpen\}/);
    expect(commandCenterSource).toContain("CanvasEmptyState");
    expect(commandCenterSource).toContain("canvasStateMessageClass");
    expect(commandCenterSource).toContain("canvasStateMessageCompactClass");
  });

  it("keeps status badges as presentation-only spans", () => {
    expect(commandCenterSource).toContain("export function StatusBadge");
    expect(sessionStatusBadgeClass("planned")).toBe("badge badge-session-planned");
  });
});
