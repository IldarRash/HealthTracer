import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const wayfindingSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "route-wayfinding.tsx"),
  "utf8",
);
const wayfindingTrailSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "route-wayfinding-trail.ts"),
  "utf8",
);

describe("RouteWayfinding", () => {
  it("renders breadcrumb trail markup for secondary routes only", () => {
    expect(wayfindingTrailSource).toContain('aria-label": "Breadcrumb"');
    expect(wayfindingTrailSource).toContain('className: "route-wayfinding"');
    expect(wayfindingTrailSource).toContain('className: "route-wayfinding__list"');
    expect(wayfindingTrailSource).toContain('className: "route-wayfinding__link"');
    expect(wayfindingTrailSource).toContain('className: "route-wayfinding__current"');
    expect(wayfindingSource).toContain("resolveSecondaryRouteWayfinding");
    expect(wayfindingSource).toContain("if (!trail) {");
    expect(wayfindingSource).toContain("return null;");
  });

  it("exposes current page location and parent link for assistive tech", () => {
    expect(wayfindingTrailSource).toContain('"aria-current": "page"');
    expect(wayfindingTrailSource).toContain("trail.parent.href");
    expect(wayfindingTrailSource).toContain("trail.parent.label");
    expect(wayfindingTrailSource).toContain("trail.current.label");
  });
});
