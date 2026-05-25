import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "longevity-dashboard.tsx"),
  "utf8",
);

describe("LongevityDashboard read-only behavior", () => {
  it("loads structured state with read-only GET helpers only", () => {
    expect(componentSource).toContain("useQuery(");
    expect(componentSource).not.toContain("useMutation(");

    const readOnlyApiCalls = [
      "listGoals(",
      "getActiveWorkoutPlan(",
      "getActiveNutritionPlan(",
      "getTodayDay(",
      "getTodayHistory(",
      "getHabitAdherence(",
      "getTodayNutritionAdherence(",
      "getCurrentWeeklyProgressSummary(",
      "listDeviceConnections(",
      "listHealthMetricAggregates(",
      "listHealthMetricSnapshots(",
      "listDocuments(",
      "getWellbeingAggregates(",
    ];

    for (const call of readOnlyApiCalls) {
      expect(componentSource).toContain(call);
    }

    const forbiddenMutationCalls = [
      "acceptProposal(",
      "applyProposal(",
      "createGoal(",
      "updateGoal(",
      "completeWorkoutSession(",
      "updateTodayItemStatus(",
      "uploadDocument(",
      "revokeDocument(",
      "generateWeeklyProgressSummary(",
    ];

    for (const call of forbiddenMutationCalls) {
      expect(componentSource).not.toContain(call);
    }
  });

  it("routes card actions through approved CTA constants without inline mutation flows", () => {
    expect(componentSource).toContain(`href={LONGEVITY_CTA_ROUTES.`);
    expect(componentSource).toContain(`href={LONGEVITY_CTA_ROUTES.chat}`);
    expect(componentSource).toContain(`promptLabel={prompt.message}`);
    expect(componentSource).toContain(`href={LONGEVITY_CTA_ROUTES.today}`);
    expect(componentSource).toContain(`href={LONGEVITY_CTA_ROUTES.training}`);
    expect(componentSource).toContain(`href={LONGEVITY_CTA_ROUTES.nutrition}`);
    expect(componentSource).toContain(`href={LONGEVITY_CTA_ROUTES.profileGoals}`);
    expect(componentSource).toContain(`href={LONGEVITY_CTA_ROUTES.profileDocuments}`);
    expect(componentSource).toContain(`href={LONGEVITY_CTA_ROUTES.profileConsent}`);
    expect(componentSource).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
    expect(componentSource).not.toContain("proposal-actions");
  });

  it("surfaces partial refresh failures without blocking the read-only dashboard", () => {
    expect(componentSource).toContain("partialErrors");
    expect(componentSource).toContain('role="status"');
    expect(componentSource).toContain(
      "Some sections could not refresh just now. Available wellness data is shown below.",
    );
  });

  it("shows weekly review read-only notice without inline mutation controls", () => {
    expect(componentSource).toContain("OverviewReadOnlyNotice");
    expect(componentSource).toContain("WEEKLY_REVIEW_READ_ONLY_NOTICE");
    expect(componentSource).not.toContain("acceptProposal");
    expect(componentSource).not.toContain("InlineProposalCard");
  });
});
