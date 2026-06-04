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
const contractProposalCardSource = readFileSync(
  join(proposalsDir, "contract-proposal-card.tsx"),
  "utf8",
);
const editableProposalContractSource = readFileSync(
  join(proposalsDir, "editable-proposal-contract.tsx"),
  "utf8",
);
const proposalCardShellSource = readFileSync(
  join(proposalsDir, "proposal-card-shell.tsx"),
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

describe("ProposalCardShell — shared confirmation chrome", () => {
  it("owns Apply, Modify, Reject affordances and error/status copy", () => {
    expect(proposalCardShellSource).toContain('"Apply"');
    expect(proposalCardShellSource).toContain("\n              Modify\n");
    expect(proposalCardShellSource).toContain("\n              Reject\n");
    expect(proposalCardShellSource).toContain('decisionMutation.mutate("accept")');
    expect(proposalCardShellSource).toContain('decisionMutation.mutate("reject")');
    expect(proposalCardShellSource).toContain("aria-busy={isActionPending");
    expect(proposalCardShellSource).toContain('aria-live="polite"');
    expect(proposalCardShellSource).toContain("Send revision request");
    expect(proposalCardShellSource).toContain("isModifyMode");
  });

  it("owns rejected, superseded, and mutation error copy", () => {
    expect(proposalCardShellSource).toContain("getProposalRejectedMessage");
    expect(proposalCardShellSource).toContain("getProposalSupersededMessage");
    expect(proposalCardShellSource).toContain('proposal.status === "rejected"');
    expect(proposalCardShellSource).toContain('proposal.status === "superseded"');
    expect(proposalCardShellSource).toContain("Could not record proposal decision.");
    expect(proposalCardShellSource).toContain("Could not request a proposal revision.");
  });

  it("renders meta pill, intent label, and status badge", () => {
    expect(proposalCardShellSource).toContain("getProposalDomainLabel");
    expect(proposalCardShellSource).toContain("getProposalDomainPillClass");
    expect(proposalCardShellSource).toContain("shouldShowInlineProposalIntentLabel");
    expect(proposalCardShellSource).toContain("getProposalIntentLabel");
    expect(proposalCardShellSource).toContain("{domainLabel}");
    expect(proposalCardShellSource).toContain("getProposalStatusBadgeTone");
    expect(proposalCardShellSource).toContain("getProposalStatusLabel");
  });

  it("delegates per-domain pending body to children and success copy to acceptedSuccessNode", () => {
    expect(proposalCardShellSource).toContain("{children}");
    expect(proposalCardShellSource).toContain("acceptedSuccessNode");
    expect(proposalCardShellSource).toContain('proposal.status === "accepted"');
    expect(proposalCardShellSource).toContain("confirmation-card__success");
  });

  it("accept button uses canAccept gate and acceptDisabledTitle for accessible disable feedback", () => {
    expect(proposalCardShellSource).toContain("canAccept");
    expect(proposalCardShellSource).toContain("acceptDisabledTitle");
    expect(proposalCardShellSource).toContain("!canAccept || isActionPending || isModifyMode");
  });
});

describe("WellbeingCheckinProposalCard", () => {
  it("keeps apply lifecycle and bounded wellbeing editing before save", () => {
    expect(wellbeingProposalSource).toContain("WellbeingScaleInput");
    expect(wellbeingProposalSource).toContain("buildWellbeingCheckinAcceptPayload");
    expect(wellbeingProposalSource).toContain("getWellbeingCheckinAcceptBlockReason");
    expect(wellbeingProposalSource).toContain("CrisisSupportPanel");
    expect(wellbeingProposalSource).toContain("useInlineProposalActions");
    // "Apply" appears as the acceptLabel prop value passed to ProposalCardShell
    expect(wellbeingProposalSource).toContain('"Apply"');
    expect(wellbeingProposalSource).toContain("ProposalCardShell");
    expect(wellbeingProposalSource).toContain("Nothing is saved until you apply");
    expect(wellbeingProposalSource.toLowerCase()).not.toContain("diagnosis");
    expect(wellbeingProposalSource.toLowerCase()).not.toContain("treatment");
  });
});

describe("NutritionIncidentProposalCard", () => {
  it("supports estimate preview, meal context, and low-confidence review gating", () => {
    // Food photo analysis was removed in Phase 8: POST /nutrition/food-photo/analyze was
    // deleted from the backend. Photos are now analyzed server-side via the chat/LLM
    // nutrition flow. Follow-up: re-add food photo capture in the chat message composer.
    expect(nutritionProposalSource).not.toContain("analyzeFoodPhoto");
    expect(nutritionProposalSource).not.toContain("Analyzing photo");
    expect(nutritionProposalSource).not.toContain('accept="image/*"');
    expect(nutritionProposalSource).toContain("Meal context:");
    expect(nutritionProposalSource).toContain("mealContextLabel");
    expect(nutritionProposalSource).toContain("buildNutritionIncidentAcceptPayload");
    expect(nutritionProposalSource).toContain("getNutritionIncidentAcceptBlockReason");
    expect(nutritionProposalSource).toContain("nutritionConfidenceNotice");
    expect(nutritionProposalSource).toContain("nutrition plan targets are unchanged");
    expect(nutritionProposalSource).toContain("useInlineProposalActions");
    expect(nutritionProposalSource).toContain("ProposalCardShell");
    // Modify/Reject affordances live in ProposalCardShell; verify shell contains them
    expect(proposalCardShellSource).toContain("\n              Modify\n");
    expect(proposalCardShellSource).toContain("\n              Reject\n");
  });
});

describe("RecommendRecipesProposalCard", () => {
  it("keeps save/modify/reject actions and nutrition navigation without target mutation copy", () => {
    expect(recommendRecipesProposalSource).toContain("Save recommendations");
    // Modify/Reject affordances live in ProposalCardShell
    expect(proposalCardShellSource).toContain("Modify");
    expect(proposalCardShellSource).toContain("Reject");
    expect(recommendRecipesProposalSource).toContain("View on Nutrition");
    expect(recommendRecipesProposalSource).toContain("approximate wellness estimates");
    expect(recommendRecipesProposalSource).toContain("does not change your nutrition targets");
    // getProposalDecisionRefreshQueryKeys lives in the shared hook, not in card-specific source
    expect(inlineProposalActionsSource).toContain("getProposalDecisionRefreshQueryKeys");
    expect(recommendRecipesProposalSource).toContain("useInlineProposalActions");
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

describe("InlineProposalCard contract routing", () => {
  it("routes a displayContract-bearing proposal to ContractProposalCard after bespoke cards", () => {
    // Bespoke intent checks must appear before the parseDisplayContract call
    const wellbeingIndex = inlineProposalSource.indexOf('"capture_wellbeing_checkin"');
    const nutritionIndex = inlineProposalSource.indexOf('"log_nutrition_incident"');
    const recipesIndex = inlineProposalSource.indexOf('"recommend_recipes"');
    // Use the function *call* (with paren) so we skip the import line
    const parseContractCallIndex = inlineProposalSource.indexOf("parseDisplayContract(");
    // Use JSX usage (angle bracket) so we skip the import line
    const contractCardJsxIndex = inlineProposalSource.indexOf("<ContractProposalCard");
    const genericCardJsxIndex = inlineProposalSource.indexOf("<GenericInlineProposalCard");

    expect(wellbeingIndex).toBeGreaterThan(-1);
    expect(nutritionIndex).toBeGreaterThan(-1);
    expect(recipesIndex).toBeGreaterThan(-1);
    expect(parseContractCallIndex).toBeGreaterThan(-1);

    // parseDisplayContract call comes after all three bespoke intent guards
    expect(parseContractCallIndex).toBeGreaterThan(wellbeingIndex);
    expect(parseContractCallIndex).toBeGreaterThan(nutritionIndex);
    expect(parseContractCallIndex).toBeGreaterThan(recipesIndex);

    // ContractProposalCard is rendered when contract is truthy
    expect(inlineProposalSource).toContain("ContractProposalCard");
    expect(inlineProposalSource).toContain("contract={contract}");

    // ContractProposalCard JSX comes before the generic fallback JSX
    expect(contractCardJsxIndex).toBeGreaterThan(-1);
    expect(genericCardJsxIndex).toBeGreaterThan(-1);
    expect(contractCardJsxIndex).toBeLessThan(genericCardJsxIndex);
  });

  it("falls through to GenericInlineProposalCard when there is no displayContract", () => {
    // The generic card import and usage must both be present as the final fallback
    expect(inlineProposalSource).toContain('import { InlineProposalCard as GenericInlineProposalCard }');
    expect(inlineProposalSource).toContain("<GenericInlineProposalCard");
  });
});

describe("ContractProposalCard", () => {
  it("wires EditableProposalContract and buildContractAcceptOverride via useInlineProposalActions getAcceptPayload", () => {
    expect(contractProposalCardSource).toContain("EditableProposalContract");
    expect(contractProposalCardSource).toContain("buildContractAcceptOverride");
    expect(contractProposalCardSource).toContain("useInlineProposalActions");
    // getAcceptPayload must call buildContractAcceptOverride with the proposal's proposedChanges and live fieldValues
    expect(contractProposalCardSource).toContain("getAcceptPayload");
    expect(contractProposalCardSource).toContain("buildContractAcceptOverride(proposal.proposedChanges, fieldValues)");
  });

  it("does NOT submit a client-computed total — derived values stay out of the accept payload", () => {
    // The card must not compute or pass any derived total (e.g. totalCalories) itself;
    // buildContractAcceptOverride only writes editable field values, and the backend recomputes totals
    expect(contractProposalCardSource).not.toContain("totalCalories");
    expect(contractProposalCardSource).not.toContain("computeDerivedValues");
    // derived computation belongs only inside EditableProposalContract (live display only)
    expect(editableProposalContractSource).toContain("computeDerivedValues");
  });

  it("seeds fieldValues from contract fields and passes them to EditableProposalContract", () => {
    expect(contractProposalCardSource).toContain("fieldValues");
    expect(contractProposalCardSource).toContain("setFieldValues");
    expect(contractProposalCardSource).toContain("onFieldValuesChange={setFieldValues}");
    expect(contractProposalCardSource).toContain("fieldValues={fieldValues}");
  });

  it("keeps Apply, Modify, and Reject actions via ProposalCardShell", () => {
    // "Apply" appears as the acceptLabel prop value passed to ProposalCardShell
    expect(contractProposalCardSource).toContain('"Apply"');
    expect(contractProposalCardSource).toContain("ProposalCardShell");
    // Modify/Reject affordances and canDecideProposal live in ProposalCardShell
    expect(proposalCardShellSource).toContain("\n              Modify\n");
    expect(proposalCardShellSource).toContain("\n              Reject\n");
    expect(proposalCardShellSource).toContain("canDecideProposal");
  });
});

describe("EditableProposalContract", () => {
  it("renders slider, number, text, and readonly field kinds", () => {
    expect(editableProposalContractSource).toContain('field.kind === "slider"');
    expect(editableProposalContractSource).toContain('field.kind === "number"');
    expect(editableProposalContractSource).toContain('field.kind === "text"');
    expect(editableProposalContractSource).toContain('type="range"');
    expect(editableProposalContractSource).toContain('type="number"');
  });

  it("shows the primary total as a live-updating headline", () => {
    expect(editableProposalContractSource).toContain("isPrimaryTotal");
    expect(editableProposalContractSource).toContain("editable-contract-primary-total");
    expect(editableProposalContractSource).toContain('aria-live="polite"');
  });

  it("computes derived values from fieldValues, not from a static total in props", () => {
    expect(editableProposalContractSource).toContain("computeDerivedValues");
    expect(editableProposalContractSource).toContain("useMemo");
    // Must not accept or use a pre-computed total prop
    expect(editableProposalContractSource).not.toContain("totalCalories");
    expect(editableProposalContractSource).not.toContain("computedTotal");
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
