import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildNutritionIncidentAcceptPayload,
  createNutritionIncidentFormState,
  getNutritionIncidentAcceptBlockReason,
} from "../../lib/action-proposal-ui-state";

const logDraftSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "recipe-nutrition-log-draft.tsx"),
  "utf8",
);

const inlineProposalActionsSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../lib/use-inline-proposal-actions.ts"),
  "utf8",
);

describe("RecipeNutritionLogDraft", () => {
  it("creates a pending proposal and parses editable draft from proposedChanges", () => {
    expect(logDraftSource).toContain("buildRecipeNutritionIncidentProposal");
    expect(logDraftSource).toContain('result.data.intent !== "log_nutrition_incident"');
    expect(logDraftSource).toContain("parseNutritionIncidentProposalPayload(proposal.proposedChanges)");
    expect(logDraftSource).toContain("createNutritionIncidentFormState(parsedPayload)");
    expect(logDraftSource).not.toContain("upsertTodayNutritionAdherence");
    expect(logDraftSource).not.toContain("logNutritionIncident");
  });

  it("accepts inline through decideProposal with edited proposedChanges", () => {
    expect(logDraftSource).toContain("useInlineProposalActions");
    expect(logDraftSource).toContain("buildNutritionIncidentAcceptPayload(form)");
    expect(logDraftSource).toContain('decisionMutation.mutate("accept")');
    expect(inlineProposalActionsSource).toContain("decideProposal");
    expect(inlineProposalActionsSource).toContain("getProposalDecisionRefreshQueryKeys");
    expect(logDraftSource).toContain("Log food entry");
    expect(logDraftSource).not.toContain("Confirm in Chat");
  });

  it("gates low-confidence accepts until user edits include userEdits", () => {
    const lowConfidenceForm = createNutritionIncidentFormState({
      incidentDateTime: "2026-05-26T18:00:00.000Z",
      items: [{ name: "Estimated bowl", quantity: "1 serving", calories: 500 }],
      estimatedCalories: 500,
      estimatedMacros: { proteinGrams: 20, carbsGrams: 60, fatGrams: 15 },
      confidence: "low",
      provenance: {
        source: "recipe_recommendation",
        providerId: "b2000001-0000-4000-8000-000000000001",
      },
      imageRefs: [],
    });

    expect(getNutritionIncidentAcceptBlockReason(lowConfidenceForm)).toContain(
      "Review and edit this low-confidence estimate",
    );

    const reviewed = { ...lowConfidenceForm, hasUserEdited: true };
    const payload = buildNutritionIncidentAcceptPayload(reviewed);
    expect(payload?.userEdits?.items[0]?.name).toBe("Estimated bowl");
    expect(getNutritionIncidentAcceptBlockReason(reviewed)).toBeNull();

    expect(logDraftSource).toContain("getNutritionIncidentAcceptBlockReason");
    expect(logDraftSource).toContain("hasUserEdited: true");
    expect(logDraftSource).toContain("validationStatus === \"invalid\"");
  });

  it("avoids target-mutation affordances and keeps optional chat deep link", () => {
    expect(logDraftSource).toContain("your nutrition targets stay unchanged");
    expect(logDraftSource).toContain("/chat?threadId=");
    expect(logDraftSource).not.toContain("adjust_nutrition");
    expect(logDraftSource).not.toContain("macro target");
    expect(logDraftSource).not.toContain("nutritionRevisions");
    expect(logDraftSource).not.toContain("updateRecipeRecommendationStatus");
  });
});
