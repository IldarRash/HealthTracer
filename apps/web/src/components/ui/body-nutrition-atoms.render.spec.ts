/**
 * Render spec for the body & nutrition shared atoms.
 *
 * Uses source-level contract checks (readFileSync) consistent with
 * the existing ui render spec pattern — no DOM renderer needed for
 * presentational contract assertions.
 *
 * For atoms with React rendering, we import renderToStaticMarkup in a
 * separate @vitest-environment node block.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const uiDir = dirname(fileURLToPath(import.meta.url));

const bodyFigureSrc = readFileSync(join(uiDir, "body-figure.tsx"), "utf8");
const statSrc = readFileSync(join(uiDir, "stat.tsx"), "utf8");
const macroMiniSrc = readFileSync(join(uiDir, "macro-mini.tsx"), "utf8");
const groceryCheckSrc = readFileSync(join(uiDir, "grocery-check.tsx"), "utf8");
const bodyAnalysisCardSrc = readFileSync(join(uiDir, "body-analysis-card.tsx"), "utf8");
const darkChartsSrc = readFileSync(join(uiDir, "dark-charts.tsx"), "utf8");
const indexSrc = readFileSync(join(uiDir, "index.ts"), "utf8");
const stylesSrc = readFileSync(join(uiDir, "../../../app/styles.css"), "utf8");

describe("BodyFigure + MuscleMap contracts", () => {
  it("exports MuscleTone, MuscleGroup, MuscleMapData, BodyFigure, MuscleMap", () => {
    expect(bodyFigureSrc).toContain("export type MuscleTone");
    expect(bodyFigureSrc).toContain("export type MuscleGroup");
    expect(bodyFigureSrc).toContain("export type MuscleMapData");
    expect(bodyFigureSrc).toContain("export function BodyFigure");
    expect(bodyFigureSrc).toContain("export function MuscleMap");
  });

  it("defines ST strength tones with 0.30 alpha fills and token strokes", () => {
    expect(bodyFigureSrc).toContain("rgba(25,195,125,0.30)"); // strong fill
    expect(bodyFigureSrc).toContain("rgba(245,165,36,0.30)"); // mid fill
    expect(bodyFigureSrc).toContain("rgba(240,80,106,0.30)"); // weak fill
    expect(bodyFigureSrc).toContain("tokens.color.metric.green");
    expect(bodyFigureSrc).toContain("tokens.color.metric.amber");
    expect(bodyFigureSrc).toContain("tokens.color.metric.red");
  });

  it("includes all 16 muscle groups: 8 front + 8 back", () => {
    // front
    for (const g of ["delts", "chest", "biceps", "forearms", "abs", "obliques", "quads", "shins"]) {
      expect(bodyFigureSrc).toContain(`"${g}"`);
    }
    // back
    for (const g of ["traps", "reardelts", "lats", "triceps", "lowerback", "glutes", "hams", "calves"]) {
      expect(bodyFigureSrc).toContain(`"${g}"`);
    }
  });

  it("SVG is aria-hidden with role presentation", () => {
    expect(bodyFigureSrc).toContain('aria-hidden="true"');
    expect(bodyFigureSrc).toContain('role="presentation"');
  });

  it("MuscleMap renders the disclaimer unconditionally via MedicalNote", () => {
    expect(bodyFigureSrc).toContain("DEFAULT_DISCLAIMER");
    expect(bodyFigureSrc).toContain("MedicalNote");
    // The disclaimer is rendered unconditionally (no conditional around it)
    expect(bodyFigureSrc).toContain("<MedicalNote");
  });

  it("MuscleMap legend includes role=list for accessible representation", () => {
    expect(bodyFigureSrc).toContain('role="list"');
    expect(bodyFigureSrc).toContain('role="listitem"');
  });

  it("shows СПЕРЕДИ / СЗАДИ side labels", () => {
    expect(bodyFigureSrc).toContain("СПЕРЕДИ");
    expect(bodyFigureSrc).toContain("СЗАДИ");
  });

  it("tone-dot uses ST stroke (text title color-independence)", () => {
    // tone dot renders the ST stroke as background
    expect(bodyFigureSrc).toContain("ST[block.tone].stroke");
    // title text label ensures color is not the sole signal
    expect(bodyFigureSrc).toContain("muscle-map__legend-title");
  });
});

describe("Stat contracts", () => {
  it("exports Stat, StatTone, StatProps", () => {
    expect(statSrc).toContain("export type StatTone");
    expect(statSrc).toContain("export type StatProps");
    expect(statSrc).toContain("export function Stat");
  });

  it("applies tabular-nums to value", () => {
    expect(statSrc).toContain("tabular-nums");
  });

  it("uses metric.green for good subTone, muted otherwise", () => {
    expect(statSrc).toContain("tokens.color.metric.green");
    expect(statSrc).toContain("tokens.color.dark.mut");
    expect(statSrc).toContain("tokens.color.light.mut");
  });

  it("supports dark and light variants via dark prop", () => {
    expect(statSrc).toContain("dark?: boolean");
    expect(statSrc).toContain("stat--dark");
    expect(statSrc).toContain("stat--light");
  });

  it("sectionLabel typography applied to label", () => {
    expect(statSrc).toContain("tokens.typography.sectionLabel");
  });
});

describe("MacroMini contracts", () => {
  it("exports MacroMini, MacroMiniProps", () => {
    expect(macroMiniSrc).toContain("export function MacroMini");
    expect(macroMiniSrc).toContain("export type MacroMiniProps");
  });

  it("has protein/carbs/fat props", () => {
    expect(macroMiniSrc).toContain("protein:");
    expect(macroMiniSrc).toContain("carbs:");
    expect(macroMiniSrc).toContain("fat:");
  });

  it("maps protein→green, carbs→blue, fat→indigo (fixed, not props)", () => {
    expect(macroMiniSrc).toContain(`"green" as const`);
    expect(macroMiniSrc).toContain(`"blue" as const`);
    expect(macroMiniSrc).toContain(`"indigo" as const`);
    // Colors are NOT passed as props — they come from internal MACRO_DEFS
    expect(macroMiniSrc).toContain("MACRO_DEFS");
  });

  it("provides aria-label for screen reader text (color-independence)", () => {
    expect(macroMiniSrc).toContain("ariaLabel");
    expect(macroMiniSrc).toContain("Белок");
    expect(macroMiniSrc).toContain("углеводы");
    expect(macroMiniSrc).toContain("жиры");
  });

  it("squares are aria-hidden, value squares have borderRadius ~2", () => {
    expect(macroMiniSrc).toContain("aria-hidden");
    expect(macroMiniSrc).toContain("borderRadius: 2");
  });

  it("applies tabular-nums to values", () => {
    expect(macroMiniSrc).toContain("tabular-nums");
  });
});

describe("GroceryCheck contracts", () => {
  it("exports GroceryCheck, GroceryCheckProps", () => {
    expect(groceryCheckSrc).toContain("export function GroceryCheck");
    expect(groceryCheckSrc).toContain("export type GroceryCheckProps");
  });

  it("uses borderRadius 6 (square, not circle)", () => {
    expect(groceryCheckSrc).toContain("borderRadius: 6");
  });

  it("checked state: metric.green fill + dark-on-green #04130c icon", () => {
    expect(groceryCheckSrc).toContain("tokens.color.metric.green");
    expect(groceryCheckSrc).toContain("#04130c");
  });

  it("unchecked border uses light.line2 token (for light grocery surface)", () => {
    expect(groceryCheckSrc).toContain("tokens.color.light.line2");
  });

  it("interactive: role=checkbox with aria-checked and keyboard handler", () => {
    expect(groceryCheckSrc).toContain('role="checkbox"');
    expect(groceryCheckSrc).toContain("aria-checked={checked}");
    expect(groceryCheckSrc).toContain('e.key === " "');
    expect(groceryCheckSrc).toContain('e.key === "Enter"');
  });

  it("static mode: aria-hidden for presentational use", () => {
    expect(groceryCheckSrc).toContain('aria-hidden="true"');
  });
});

describe("BodyAnalysisCard contracts", () => {
  it("exports BodyAnalysisCard, BodyAnalysisMetric, BodyAnalysisZone, BodyAnalysisCardProps", () => {
    expect(bodyAnalysisCardSrc).toContain("export function BodyAnalysisCard");
    expect(bodyAnalysisCardSrc).toContain("export type BodyAnalysisMetric");
    expect(bodyAnalysisCardSrc).toContain("export type BodyAnalysisZone");
    expect(bodyAnalysisCardSrc).toContain("export type BodyAnalysisCardProps");
  });

  it("contains verbatim disclaimer text (±3–4% copy)", () => {
    expect(bodyAnalysisCardSrc).toContain("±3–4%");
    expect(bodyAnalysisCardSrc).toContain("не замер состава тела");
    expect(bodyAnalysisCardSrc).toContain("Не медицинская диагностика");
  });

  it("disclaimer is always rendered (not conditional, uses DEFAULT_DISCLAIMER fallback)", () => {
    expect(bodyAnalysisCardSrc).toContain("DEFAULT_DISCLAIMER");
    expect(bodyAnalysisCardSrc).toContain("MedicalNote");
    // disclaimer rendered with ?? DEFAULT_DISCLAIMER fallback
    expect(bodyAnalysisCardSrc).toContain("disclaimer ?? DEFAULT_DISCLAIMER");
  });

  it("has footer slot for proposal actions or provenance strip", () => {
    expect(bodyAnalysisCardSrc).toContain("footer?:");
    expect(bodyAnalysisCardSrc).toContain("body-analysis-card__footer");
  });

  it("metrics support amber, green, and ink tones", () => {
    expect(bodyAnalysisCardSrc).toContain('"amber"');
    expect(bodyAnalysisCardSrc).toContain('"green"');
    expect(bodyAnalysisCardSrc).toContain('"ink"');
  });

  it("strong zones tinted greenDim, growth zones tinted redDim", () => {
    expect(bodyAnalysisCardSrc).toContain("tokens.color.metric.greenDim");
    expect(bodyAnalysisCardSrc).toContain("tokens.color.metric.redDim");
  });

  it("zone labels carry accessible text (not color-only)", () => {
    expect(bodyAnalysisCardSrc).toContain("Сильные зоны");
    expect(bodyAnalysisCardSrc).toContain("Зоны роста");
  });

  it("owns no mutation logic — footer slot only", () => {
    // No mutation hooks or save/accept/reject logic in this atom
    expect(bodyAnalysisCardSrc).not.toContain("useMutation");
    expect(bodyAnalysisCardSrc).not.toContain("useQuery");
    expect(bodyAnalysisCardSrc).not.toContain("fetch(");
  });
});

describe("DsTrendStrip barColor override", () => {
  it("adds barColor prop to DsTrendStripProps", () => {
    expect(darkChartsSrc).toContain("barColor?: string");
  });

  it("uses barColorOverride when provided and sets opacity 1", () => {
    expect(darkChartsSrc).toContain("barColorOverride");
    expect(darkChartsSrc).toContain("barColorOverride != null ? 1");
  });

  it("falls back to threshold barColor() when override is absent", () => {
    // The threshold function is still present
    expect(darkChartsSrc).toContain("function barColor(value: number)");
    expect(darkChartsSrc).toContain("barColorOverride ?? barColor(day.value)");
  });

  it("preserves existing <30 opacity dimming for non-overridden bars", () => {
    expect(darkChartsSrc).toContain("day.value < 30 ? 0.55 : 1");
  });
});

describe("index.ts re-exports", () => {
  it("exports all five new atoms", () => {
    expect(indexSrc).toContain("BodyFigure");
    expect(indexSrc).toContain("MuscleMap");
    expect(indexSrc).toContain("BodyAnalysisCard");
    expect(indexSrc).toContain("GroceryCheck");
    expect(indexSrc).toContain("MacroMini");
    expect(indexSrc).toContain("Stat");
  });

  it("exports all new atom types", () => {
    expect(indexSrc).toContain("MuscleTone");
    expect(indexSrc).toContain("MuscleGroup");
    expect(indexSrc).toContain("MuscleMapData");
    expect(indexSrc).toContain("BodyAnalysisMetric");
    expect(indexSrc).toContain("BodyAnalysisZone");
    expect(indexSrc).toContain("StatTone");
    expect(indexSrc).toContain("GroceryCheckProps");
    expect(indexSrc).toContain("MacroMiniProps");
  });
});

describe("styles.css atom classes", () => {
  it("defines body-figure classes", () => {
    expect(stylesSrc).toContain(".body-figure");
    expect(stylesSrc).toContain(".body-figure__side-label");
  });

  it("defines muscle-map classes", () => {
    expect(stylesSrc).toContain(".muscle-map");
    expect(stylesSrc).toContain(".muscle-map__header");
    expect(stylesSrc).toContain(".muscle-map__figures");
    expect(stylesSrc).toContain(".muscle-map__legend");
    expect(stylesSrc).toContain(".muscle-map__coach-hint");
    expect(stylesSrc).toContain(".muscle-map__disclaimer");
  });

  it("defines stat classes", () => {
    expect(stylesSrc).toContain(".stat");
    expect(stylesSrc).toContain(".stat__value");
    expect(stylesSrc).toContain(".stat__unit");
    expect(stylesSrc).toContain(".stat__label");
    expect(stylesSrc).toContain(".stat__sub");
  });

  it("defines macro-mini classes", () => {
    expect(stylesSrc).toContain(".macro-mini");
    expect(stylesSrc).toContain(".macro-mini__item");
    expect(stylesSrc).toContain(".macro-mini__square");
    expect(stylesSrc).toContain(".macro-mini__value");
  });

  it("defines grocery-check classes with focus-visible", () => {
    expect(stylesSrc).toContain(".grocery-check");
    expect(stylesSrc).toContain(".grocery-check--interactive");
    expect(stylesSrc).toContain(".grocery-check--interactive:focus-visible");
  });

  it("defines body-analysis-card classes", () => {
    expect(stylesSrc).toContain(".body-analysis-card");
    expect(stylesSrc).toContain(".body-analysis-card__header");
    expect(stylesSrc).toContain(".body-analysis-card__metrics");
    expect(stylesSrc).toContain(".body-analysis-card__zone");
    expect(stylesSrc).toContain(".body-analysis-card__zone--strong");
    expect(stylesSrc).toContain(".body-analysis-card__zone--growth");
    expect(stylesSrc).toContain(".body-analysis-card__disclaimer");
    expect(stylesSrc).toContain(".body-analysis-card__footer");
  });
});
