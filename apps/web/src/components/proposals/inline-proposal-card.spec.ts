import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Normalize CRLF → LF so assertions work cross-platform. */
function readSource(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

const proposalsDir = dirname(fileURLToPath(import.meta.url));
const inlineProposalSource = readSource(join(proposalsDir, "inline-proposal-card.tsx"));
const wellbeingProposalSource = readSource(join(proposalsDir, "wellbeing-checkin-proposal-card.tsx"));
const nutritionProposalSource = readSource(join(proposalsDir, "nutrition-incident-proposal-card.tsx"));
const recommendRecipesProposalSource = readSource(join(proposalsDir, "recommend-recipes-proposal-card.tsx"));
const chatWorkspaceSource = readSource(join(proposalsDir, "../chat/chat-workspace.tsx"));
const inlineProposalActionsSource = readSource(join(proposalsDir, "../../lib/use-inline-proposal-actions.ts"));
const contractProposalCardSource = readSource(join(proposalsDir, "contract-proposal-card.tsx"));
const editableProposalContractSource = readSource(join(proposalsDir, "editable-proposal-contract.tsx"));
const proposalCardShellSource = readSource(join(proposalsDir, "proposal-card-shell.tsx"));
const adjustNutritionCardSource = readSource(join(proposalsDir, "adjust-nutrition-plan-proposal-card.tsx"));
const actionProposalUiStateSource = readSource(join(proposalsDir, "../../lib/action-proposal-ui-state.ts"));

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
    expect(proposalCardShellSource).toContain("Modify");
    expect(proposalCardShellSource).toContain("Reject");
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
    // ProposalStateBand wraps accepted/rejected/superseded copy (replaces confirmation-card__success)
    expect(proposalCardShellSource).toContain("ProposalStateBand");
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
    expect(proposalCardShellSource).toContain("Modify");
    expect(proposalCardShellSource).toContain("Reject");
  });

  it("renders per-item calories via Stepper (step=10, min=0) not a bare number input", () => {
    expect(nutritionProposalSource).toContain("Stepper");
    expect(nutritionProposalSource).toContain("step={10}");
    expect(nutritionProposalSource).toContain("min={0}");
    // name/quantity inputs remain as text inputs (not Stepper)
    expect(nutritionProposalSource).toContain('className="form-input"');
    // bare calories <input type="number"> must be gone
    expect(nutritionProposalSource).not.toContain('inputMode="numeric"');
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
    // Provenance is now rendered via formatRecipeProvenanceHuman (no ID leakage)
    expect(recommendRecipesProposalSource).toContain("formatRecipeProvenanceHuman");
    expect(recommendRecipesProposalSource).toContain("Loading recipe details");
    expect(recommendRecipesProposalSource).toContain("does not change your nutrition targets");
    expect(recommendRecipesProposalSource).not.toContain("Recipe ID:");
  });
});

describe("GenericInlineProposalCard chat hierarchy", () => {
  const genericProposalSource = readSource(join(proposalsDir, "inline-proposal-card-generic.tsx"));

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
    expect(genericProposalSource).toContain("Modify");
    expect(genericProposalSource).toContain("Reject");
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
    // Links now use proposal-frame__link class (ProposalFrame chrome)
    expect(genericProposalSource).toContain('className="proposal-frame__link"');
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
    expect(proposalCardShellSource).toContain("Modify");
    expect(proposalCardShellSource).toContain("Reject");
    expect(proposalCardShellSource).toContain("canDecideProposal");
  });
});

describe("EditableProposalContract", () => {
  it("renders slider, number, text, and readonly field kinds", () => {
    expect(editableProposalContractSource).toContain('field.kind === "slider"');
    expect(editableProposalContractSource).toContain('field.kind === "number"');
    expect(editableProposalContractSource).toContain('field.kind === "text"');
    expect(editableProposalContractSource).toContain('type="range"');
    // number fields now render via Stepper (bounded ± control) instead of <input type="number">
    expect(editableProposalContractSource).toContain("Stepper");
    expect(editableProposalContractSource).toContain("<Stepper");
  });

  it("number fields use Stepper with min/max/step preserved", () => {
    expect(editableProposalContractSource).toContain("field.min");
    expect(editableProposalContractSource).toContain("field.max");
    expect(editableProposalContractSource).toContain("field.step");
  });

  it("adds Eyebrow 'Edit before applying' above editable fields", () => {
    expect(editableProposalContractSource).toContain("Edit before applying");
    expect(editableProposalContractSource).toContain("Eyebrow");
  });

  it("readonly/non-editable fields show lock affordance with 'Set by your coach' hint", () => {
    expect(editableProposalContractSource).toContain("Set by your coach");
    expect(editableProposalContractSource).toContain("editable-contract-locked-row");
    expect(editableProposalContractSource).toContain("editable-contract-locked-hint");
    expect(editableProposalContractSource).toContain('name="lock"');
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
    // Revision sends now go through the streaming path (with sync fallback).
    expect(chatWorkspaceSource).toContain("sendMessageStreaming");
    expect(chatWorkspaceSource).toContain("pendingRevisionSend");
    expect(chatWorkspaceSource).toContain("shouldShowProposalRevisionSendRetry");
    expect(chatWorkspaceSource).toContain("Retry revision message");
    expect(chatWorkspaceSource).toContain("proposalRevision");
  });
});

describe("AdjustNutritionPlanProposalCard — C4 dietary draft", () => {
  it("is wired into the inline-proposal-card router for adjust_nutrition_plan with swaps", () => {
    // Router must import and call tryRenderAdjustNutritionPlanProposalCard
    expect(inlineProposalSource).toContain("tryRenderAdjustNutritionPlanProposalCard");
    expect(inlineProposalSource).toContain("adjust-nutrition-plan-proposal-card");
    // The dietary-draft check must appear BEFORE the displayContract fallback
    const dietaryCardIndex = inlineProposalSource.indexOf("tryRenderAdjustNutritionPlanProposalCard(");
    const parseContractIndex = inlineProposalSource.indexOf("parseDisplayContract(");
    expect(dietaryCardIndex).toBeGreaterThan(-1);
    expect(parseContractIndex).toBeGreaterThan(-1);
    expect(dietaryCardIndex).toBeLessThan(parseContractIndex);
  });

  it("renders before/after calorie compare and swap DiffRow list", () => {
    expect(adjustNutritionCardSource).toContain("dietary-draft__compare");
    expect(adjustNutritionCardSource).toContain("dietary-draft__swap-row");
    // struck-through "from" label uses the dietary-draft__swap-from CSS class
    // (line-through is defined in styles.css .dietary-draft__swap-from)
    expect(adjustNutritionCardSource).toContain("dietary-draft__swap-from");
    expect(adjustNutritionCardSource).toContain("dietary-draft__swap-to");
    expect(adjustNutritionCardSource).toContain("SwapList");
    expect(adjustNutritionCardSource).toContain("BeforeAfterCompare");
  });

  it("renders protein-preserved macro chips on both sides of the compare", () => {
    expect(adjustNutritionCardSource).toContain("MacroChip");
    expect(adjustNutritionCardSource).toContain("fromProtein");
    expect(adjustNutritionCardSource).toContain("toProtein");
  });

  it("uses ProposalCardShell for accept/modify/reject actions and never duplicates the lifecycle", () => {
    expect(adjustNutritionCardSource).toContain("ProposalCardShell");
    expect(adjustNutritionCardSource).toContain("useInlineProposalActions");
    expect(adjustNutritionCardSource).toContain("acceptLabel");
    // Must not duplicate apply/revision logic — lifecycle lives in the shell + hook
    expect(adjustNutritionCardSource).not.toContain("decideProposal");
    expect(adjustNutritionCardSource).not.toContain("appendRevision");
  });

  it("shows accepted success copy with a View on Nutrition link", () => {
    expect(adjustNutritionCardSource).toContain("Plan updated");
    expect(adjustNutritionCardSource).toContain("View nutrition");
    expect(adjustNutritionCardSource).toContain("confirmation-card__link");
    // The link class may be either confirmation-card__link (card-specific) or proposal-frame__link
    // Both are acceptable — the test checks only that a link is present
  });

  it("parseAdjustNutritionPlanProposalPayload returns null when swaps is absent", () => {
    expect(actionProposalUiStateSource).toContain("parseAdjustNutritionPlanProposalPayload");
    expect(actionProposalUiStateSource).toContain("adjustNutritionPlanFromProgressChangesSchema");
    // Guard: only treat as dietary-draft card when swaps metadata is present
    expect(actionProposalUiStateSource).toContain("parsed.data.swaps");
    expect(actionProposalUiStateSource).toContain("swaps.length === 0");
  });

  it("does not contain medical, diagnosis, or treatment language", () => {
    expect(adjustNutritionCardSource.toLowerCase()).not.toContain("diagnosis");
    expect(adjustNutritionCardSource.toLowerCase()).not.toContain("treatment");
    expect(adjustNutritionCardSource.toLowerCase()).not.toContain("prescription");
    expect(adjustNutritionCardSource.toLowerCase()).not.toContain("medical advice");
  });

  it("renders an empty-swaps fallback state when no swaps are provided", () => {
    expect(adjustNutritionCardSource).toContain("No substitution details");
  });

  it("shows the swap count and total kcal saved in the swaps header", () => {
    expect(adjustNutritionCardSource).toContain("swap");
    expect(adjustNutritionCardSource).toContain("totalSaved");
    expect(adjustNutritionCardSource).toContain("kcal");
  });
});
