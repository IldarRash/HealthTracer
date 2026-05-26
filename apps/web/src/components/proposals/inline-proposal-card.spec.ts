import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const proposalsDir = dirname(fileURLToPath(import.meta.url));
const inlineProposalSource = readFileSync(
  join(proposalsDir, "inline-proposal-card.tsx"),
  "utf8",
);
const wellbeingProposalSource = readFileSync(
  join(proposalsDir, "wellbeing-checkin-proposal-card.tsx"),
  "utf8",
);
const nutritionProposalSource = readFileSync(
  join(proposalsDir, "nutrition-incident-proposal-card.tsx"),
  "utf8",
);
const recommendRecipesProposalSource = readFileSync(
  join(proposalsDir, "recommend-recipes-proposal-card.tsx"),
  "utf8",
);
const chatWorkspaceSource = readFileSync(
  join(proposalsDir, "../chat/chat-workspace.tsx"),
  "utf8",
);
const inlineProposalActionsSource = readFileSync(
  join(proposalsDir, "../../lib/use-inline-proposal-actions.ts"),
  "utf8",
);

describe("InlineProposalCard chat hierarchy", () => {
  it("routes wellbeing and nutrition incident intents to specialized cards", () => {
    expect(inlineProposalSource).toContain('props.proposal.intent === "capture_wellbeing_checkin"');
    expect(inlineProposalSource).toContain('props.proposal.intent === "log_nutrition_incident"');
    expect(inlineProposalSource).toContain('props.proposal.intent === "recommend_recipes"');
    expect(inlineProposalSource).toContain("WellbeingCheckinProposalCard");
    expect(inlineProposalSource).toContain("NutritionIncidentProposalCard");
    expect(inlineProposalSource).toContain("RecommendRecipesProposalCard");
  });

  it("does not render raw intent, domain, or validation status strings", () => {
    expect(wellbeingProposalSource).not.toContain("proposal.intent.replaceAll");
    expect(nutritionProposalSource).not.toContain("validationStatus");
  });
});

describe("WellbeingCheckinProposalCard", () => {
  it("keeps apply lifecycle and bounded wellbeing editing before save", () => {
    expect(wellbeingProposalSource).toContain("WellbeingScaleInput");
    expect(wellbeingProposalSource).toContain("buildWellbeingCheckinAcceptPayload");
    expect(wellbeingProposalSource).toContain("getWellbeingCheckinAcceptBlockReason");
    expect(wellbeingProposalSource).toContain("CrisisSupportPanel");
    expect(wellbeingProposalSource).toContain("useInlineProposalActions");
    expect(wellbeingProposalSource).toContain('"Apply"');
    expect(wellbeingProposalSource).toContain("\n              Reject\n");
    expect(wellbeingProposalSource).toContain("Nothing is saved until you apply");
    expect(wellbeingProposalSource.toLowerCase()).not.toContain("diagnosis");
    expect(wellbeingProposalSource.toLowerCase()).not.toContain("treatment");
  });
});

describe("NutritionIncidentProposalCard", () => {
  it("supports photo analysis, estimate preview, and low-confidence review gating", () => {
    expect(nutritionProposalSource).toContain("analyzeFoodPhoto");
    expect(nutritionProposalSource).toContain("Analyzing photo");
    expect(nutritionProposalSource).toContain("buildNutritionIncidentAcceptPayload");
    expect(nutritionProposalSource).toContain("getNutritionIncidentAcceptBlockReason");
    expect(nutritionProposalSource).toContain("nutritionConfidenceNotice");
    expect(nutritionProposalSource).toContain('accept="image/*"');
    expect(nutritionProposalSource).toContain("nutrition plan targets are unchanged");
    expect(nutritionProposalSource).toContain("useInlineProposalActions");
    expect(nutritionProposalSource).toContain("analysisError");
    expect(nutritionProposalSource).toContain("edit the estimate manually");
    expect(nutritionProposalSource).toContain("\n              Modify\n");
    expect(nutritionProposalSource).toContain("\n              Reject\n");
  });
});

describe("RecommendRecipesProposalCard", () => {
  it("keeps save/modify/reject actions and nutrition navigation without target mutation copy", () => {
    expect(recommendRecipesProposalSource).toContain("Save recommendations");
    expect(recommendRecipesProposalSource).toContain("Modify");
    expect(recommendRecipesProposalSource).toContain("Reject");
    expect(recommendRecipesProposalSource).toContain("View on Nutrition");
    expect(recommendRecipesProposalSource).toContain("approximate wellness estimates");
    expect(recommendRecipesProposalSource).toContain("does not change your nutrition targets");
    expect(recommendRecipesProposalSource).toContain("getProposalDecisionRefreshQueryKeys");
    expect(recommendRecipesProposalSource).not.toContain("adjust_nutrition_plan");
    expect(recommendRecipesProposalSource).not.toContain("macro target");
  });

  it("lists proposed recipe fit summaries and handles invalid payloads safely", () => {
    expect(recommendRecipesProposalSource).toContain("recipeRecommendationProposalPayloadSchema");
    expect(recommendRecipesProposalSource).toContain("recipe-recommendation-list");
    expect(recommendRecipesProposalSource).toContain(
      "Recipe recommendation details could not be loaded",
    );
  });

  it("resolves recipe details for review instead of showing raw recipe IDs", () => {
    expect(recommendRecipesProposalSource).toContain("useQueries");
    expect(recommendRecipesProposalSource).toContain("getRecipe");
    expect(recommendRecipesProposalSource).toContain("apiQueryKeys.recipeDetail");
    expect(recommendRecipesProposalSource).toContain("formatMacroEstimateSummary");
    expect(recommendRecipesProposalSource).toContain("formatRecipeProviderLabel");
    expect(recommendRecipesProposalSource).toContain("RECIPE_CONFIDENCE_LABELS");
    expect(recommendRecipesProposalSource).toContain("formatRecipeProvenanceMeta");
    expect(recommendRecipesProposalSource).toContain("Loading recipe details");
    expect(recommendRecipesProposalSource).toContain("does not change your nutrition targets");
    expect(recommendRecipesProposalSource).not.toContain("Recipe ID:");
  });
});

describe("GenericInlineProposalCard chat hierarchy", () => {
  const genericProposalSource = readFileSync(
    join(proposalsDir, "inline-proposal-card-generic.tsx"),
    "utf8",
  );

  it("does not render raw intent, domain, or validation status strings", () => {
    expect(genericProposalSource).not.toContain("proposal.intent.replaceAll");
    expect(genericProposalSource).not.toContain("{proposal.targetDomain}");
    expect(genericProposalSource).not.toContain("validationStatus");
    expect(genericProposalSource).not.toContain("accept only if");
    expect(genericProposalSource).not.toContain("Validation issues");
    expect(genericProposalSource).not.toContain("JSON.stringify");
  });

  it("uses mapped domain and optional intent labels in metadata", () => {
    expect(genericProposalSource).toContain("getProposalDomainLabel");
    expect(genericProposalSource).toContain("shouldShowInlineProposalIntentLabel");
    expect(genericProposalSource).toContain("getProposalIntentLabel");
    expect(genericProposalSource).toContain("{domainLabel}");
    expect(genericProposalSource).toContain("INLINE_PROPOSAL_VALIDATION_HEADING");
  });

  it("keeps Apply, Modify, and Reject actions with disabled Apply for invalid proposals", () => {
    expect(genericProposalSource).toContain("canDecideProposal");
    expect(genericProposalSource).toContain("canAcceptProposal");
    expect(genericProposalSource).toContain('"Apply"');
    expect(genericProposalSource).toContain("\n              Modify\n");
    expect(genericProposalSource).toContain("\n              Reject\n");
    expect(genericProposalSource).toContain("getAcceptDisabledReason");
    expect(genericProposalSource).toContain("modifyProposal");
    expect(genericProposalSource).not.toContain('"Accept change"');
    expect(genericProposalSource).not.toContain("Decline");
  });

  it("shows rejected and superseded confirmation copy", () => {
    expect(genericProposalSource).toContain("getProposalRejectedMessage");
    expect(genericProposalSource).toContain("getProposalSupersededMessage");
    expect(genericProposalSource).toContain('proposal.status === "rejected"');
    expect(genericProposalSource).toContain('proposal.status === "superseded"');
    expect(genericProposalSource).toContain("Send revision request");
    expect(genericProposalSource).toContain("isModifyMode");
  });

  it("renders before/after summaries instead of raw proposedChanges", () => {
    expect(genericProposalSource).toContain("summarizeProposalChanges");
    expect(genericProposalSource).toContain("ProposalChangeSummaryView");
    expect(genericProposalSource).toContain("<strong>Before</strong>");
    expect(genericProposalSource).toContain("<strong>After</strong>");
  });

  it("keeps post-apply navigation links", () => {
    expect(genericProposalSource).toContain("getProposalNavigationRoute");
    expect(genericProposalSource).toContain("View updated plan →");
    expect(genericProposalSource).toContain("Open Today →");
    expect(genericProposalSource).toContain('className="confirmation-card__link"');
  });
});

describe("Inline proposal action hooks", () => {
  it("invalidates wellbeing and nutrition refresh keys after accepted decisions", () => {
    expect(inlineProposalActionsSource).toContain("getProposalDecisionRefreshQueryKeys");
    expect(inlineProposalActionsSource).toContain("decideProposal");
    expect(inlineProposalActionsSource).toContain("modifyProposal");
    expect(inlineProposalActionsSource).toContain('decision === "accept"');
    expect(inlineProposalActionsSource).toContain("getAcceptPayload?.()");
  });
});

describe("ChatWorkspace proposal revision routing", () => {
  it("routes modify responses into structured chat send with retry recovery", () => {
    expect(chatWorkspaceSource).toContain("buildProposalRevisionChatSend");
    expect(chatWorkspaceSource).toContain("onModifyRequest={handleProposalModifyRequest}");
    expect(chatWorkspaceSource).toContain("sendMessageMutation.mutate(revisionSend)");
    expect(chatWorkspaceSource).toContain("pendingRevisionSend");
    expect(chatWorkspaceSource).toContain("shouldShowProposalRevisionSendRetry");
    expect(chatWorkspaceSource).toContain("Retry revision message");
    expect(chatWorkspaceSource).toContain("proposalRevision");
  });
});
