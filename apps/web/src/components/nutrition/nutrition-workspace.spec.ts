import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "nutrition-workspace.tsx"),
  "utf8",
);

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../app/nutrition/page.tsx"),
  "utf8",
);

describe("NutritionWorkspace read-only contracts", () => {
  it("does not expose adherence mutation controls", () => {
    expect(workspaceSource).not.toContain("useMutation");
    expect(workspaceSource).not.toContain("upsertTodayNutritionAdherence");
    expect(workspaceSource).not.toContain("toggleMealCompletion");
    expect(workspaceSource).not.toContain("toggleTargetCompletion");
    expect(workspaceSource).not.toContain('type="checkbox"');
    expect(workspaceSource).not.toContain("Cycle status");
    expect(workspaceSource).not.toContain("Save note");
    expect(workspaceSource).not.toContain("<textarea");
    expect(workspaceSource).not.toContain('type="number"');
  });

  it("shows read-only adherence summary facts and routes logging to Today", () => {
    expect(workspaceSource).toContain("PlanViewCtaLink");
    expect(workspaceSource).toContain("buildNutritionPlanAdherenceFacts");
    expect(workspaceSource).toContain("PlanFacts");
    expect(workspaceSource).toContain("Log on Today →");
    expect(workspaceSource).toContain('href="/today"');
    expect(workspaceSource).toContain("What you've logged today");
  });

  it("keeps plan change routing in Chat and removes raw JSON debug output", () => {
    expect(workspaceSource).toContain("ChangeViaChatNotice");
    expect(workspaceSource).not.toContain("JSON.stringify");
    expect(workspaceSource).not.toContain("Adherence debug record");
    expect(workspaceSource).not.toContain("proposal-details");
  });

  it("preserves active plan display and collapsible revision history", () => {
    expect(workspaceSource).toContain("PlanHeader");
    expect(workspaceSource).toContain("revisionNumber={activeRevision.revisionNumber}");
    expect(workspaceSource).toContain("RevisionHistoryCollapsible");
    expect(workspaceSource).toContain("RevisionHistoryItem");
    expect(workspaceSource).toContain("active={revision.id === activeRevision.id}");
    expect(workspaceSource).toContain('titleId="nutrition-revision-history"');
    expect(workspaceSource).toContain("Daily targets");
    expect(workspaceSource).toContain("Meal structure");
    expect(workspaceSource).toContain("formatPlanRevisionSource");
    expect(workspaceSource).toContain("formatRevisionHistoryMeta");
    expect(workspaceSource).not.toContain("ai_proposal");
  });

  it("uses human-readable apostrophe in adherence load error copy", () => {
    expect(workspaceSource).toContain("Today's adherence could not be loaded.");
    expect(workspaceSource).not.toContain("Today&apos;s adherence could not be loaded.");
  });

  it("loads today adherence read-only without mutation or upsert APIs", () => {
    expect(workspaceSource).toContain("getTodayNutritionAdherence");
    expect(workspaceSource).not.toContain("upsertTodayNutritionAdherence");
    expect(workspaceSource).not.toContain("useMutation");
    expect(workspaceSource).not.toContain("mutate(");
  });

  it("embeds nested recipe recommendations without mutating nutrition plan state", () => {
    expect(workspaceSource).toContain("RecipeRecommendationsPanel");
    expect(workspaceSource).toContain('title="Recipe recommendations"');
    expect(workspaceSource).not.toContain("upsertNutritionAdherence");
    expect(workspaceSource).not.toContain("adjust_nutrition_plan");
  });

  it("uses shared plan view layout classes for structured canvas styling", () => {
    expect(workspaceSource).toContain("PlanViewLayout");
    expect(workspaceSource).toContain("PlanViewGrid");
    expect(workspaceSource).toContain('variant="prominent"');
    expect(workspaceSource).toContain('variant="wide"');
  });
});

describe("Nutrition page header copy", () => {
  it("uses wayfinding title and read-only plan language", () => {
    expect(pageSource).toContain('title="Nutrition"');
    expect(pageSource).toContain("Read-only view");
    expect(pageSource).not.toContain("Workouts");
  });
});
