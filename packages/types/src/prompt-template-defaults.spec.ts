/**
 * W4 tests — prompt-template-defaults (Workstream 2 markers)
 *
 * Asserts that the fan-out template bodies contain the language-match
 * instruction and the new payload/routing markers W2 added. Also asserts
 * that PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS contains the expected placeholders
 * (updated in the i18n feature to include responseLanguage for domain/decision templates).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROMPT_TEMPLATE_BODIES,
  PROGRESS_HISTORY_METRIC_LEGEND_PROMPT_BLOCK,
  PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS,
  ROUTER_DECISION_TEMPLATE_KEY,
  DOMAIN_WORKOUT_TEMPLATE_KEY,
  DOMAIN_NUTRITION_TEMPLATE_KEY,
  DOMAIN_HEALTH_TEMPLATE_KEY,
  FINAL_DECISION_TEMPLATE_KEY,
  type PromptTemplateKey,
} from "./prompt-template-defaults.js";
import { PROGRESS_HISTORY_METRIC_LEGEND } from "./progress-history.js";
import { compilePromptTemplates } from "./prompt-template-renderer.js";

// ---------------------------------------------------------------------------
// Language-match instruction — every fan-out template must carry it
// ---------------------------------------------------------------------------

describe("prompt-template-defaults — language-match instruction (W2 [LANG])", () => {
  const fanOutKeys = [
    ROUTER_DECISION_TEMPLATE_KEY,
    DOMAIN_WORKOUT_TEMPLATE_KEY,
    DOMAIN_NUTRITION_TEMPLATE_KEY,
    DOMAIN_HEALTH_TEMPLATE_KEY,
    FINAL_DECISION_TEMPLATE_KEY,
  ] as const;

  for (const key of fanOutKeys) {
    it(`${key} template body contains a language-match instruction`, () => {
      const body = DEFAULT_PROMPT_TEMPLATE_BODIES[key];
      // The instruction should mention responseLanguage (i18n feature) or fall back to
      // the user's language / detectedLanguage (router template keeps the original form).
      const hasLangInstruction =
        body.includes("responseLanguage") ||
        body.includes("user's language") ||
        body.includes("detectedLanguage");
      expect(hasLangInstruction).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Router — routing rule and examples markers (W2 [ROUTING-RULE] / [EXAMPLES])
// ---------------------------------------------------------------------------

describe("prompt-template-defaults — router routing rule (W2 [ROUTING-RULE])", () => {
  const body = DEFAULT_PROMPT_TEMPLATE_BODIES[ROUTER_DECISION_TEMPLATE_KEY];

  it("contains the high-confidence routing rule for explicit plan requests", () => {
    expect(body).toContain("ROUTING RULE");
    expect(body).toContain("confidence >= 0.9");
  });

  it("includes Russian plan-request phrases in the routing rule", () => {
    expect(body).toContain("впиши мне это в план");
    expect(body).toContain("составь программу тренировок");
  });

  it("contains routing examples including a Russian plan request example (W2 [EXAMPLES])", () => {
    expect(body).toContain("EXAMPLES:");
    // Russian example phrase
    expect(body).toContain("впиши мне это сразу в план");
    // Example shows high-confidence workout routing
    expect(body).toContain('"confidence":0.9');
  });

  it("has the general-advice no-domain example", () => {
    // Example showing that generic advice does NOT route to a domain
    expect(body).toContain("How do I stay consistent");
    expect(body).toContain("selectedDomains:[]");
  });
});

// ---------------------------------------------------------------------------
// domain_workout — candidate emission rule and payload shapes (W2 [CANDIDATE-RULE] / [PAYLOAD-SHAPES])
// ---------------------------------------------------------------------------

describe("prompt-template-defaults — domain_workout candidate rule (W2 [CANDIDATE-RULE])", () => {
  const body = DEFAULT_PROMPT_TEMPLATE_BODIES[DOMAIN_WORKOUT_TEMPLATE_KEY];

  it("contains the candidate emission rule", () => {
    expect(body).toContain("CANDIDATE EMISSION RULE");
    expect(body).toContain("non-empty candidateProposals");
  });

  it("documents create_workout_plan payload shape", () => {
    expect(body).toContain("create_workout_plan");
    expect(body).toContain("proposedChanges");
  });

  it("documents log_workout_activity payload shape", () => {
    expect(body).toContain("log_workout_activity");
    // log_workout_activity requires estimatedCalories OR ratePerHour
    expect(body).toContain("ratePerHour");
  });

  it("documents adapt_workout_plan intent", () => {
    expect(body).toContain("adapt_workout_plan");
  });
});

// ---------------------------------------------------------------------------
// domain_nutrition — candidate emission rule and payload shapes (W2 [CANDIDATE-RULE] / [PAYLOAD-SHAPES])
// ---------------------------------------------------------------------------

describe("prompt-template-defaults — domain_nutrition candidate rule (W2 [CANDIDATE-RULE])", () => {
  const body = DEFAULT_PROMPT_TEMPLATE_BODIES[DOMAIN_NUTRITION_TEMPLATE_KEY];

  it("contains the candidate emission rule", () => {
    expect(body).toContain("CANDIDATE EMISSION RULE");
    expect(body).toContain("non-empty candidateProposals");
  });

  it("documents create_nutrition_plan payload shape", () => {
    expect(body).toContain("create_nutrition_plan");
    expect(body).toContain("proposedChanges");
  });

  it("documents log_nutrition_incident payload shape", () => {
    expect(body).toContain("log_nutrition_incident");
  });
});

// ---------------------------------------------------------------------------
// domain_health — context-only + consent wording preserved (W2 [HEALTH-CONTEXT-ONLY])
// ---------------------------------------------------------------------------

describe("prompt-template-defaults — domain_health context-only wording", () => {
  const body = DEFAULT_PROMPT_TEMPLATE_BODIES[DOMAIN_HEALTH_TEMPLATE_KEY];

  it("preserves health-domain context-only wording", () => {
    expect(body).toContain("context-only");
    expect(body).toContain("consent");
  });

  it("domain_answer shape includes candidateProposals field", () => {
    expect(body).toContain("candidateProposals:[]");
  });

  it("describes body analysis rule for physique photo assessment", () => {
    expect(body).toContain("BODY ANALYSIS RULE");
    expect(body).toContain("save_body_analysis");
    expect(body).toContain("примерная визуальная оценка по фото");
  });

  it("requires the body analysis disclaimer in proposal reason", () => {
    expect(body).toContain("не замер состава тела и не диагноз");
  });

  it("prohibits photo bytes in save_body_analysis proposedChanges", () => {
    expect(body).toContain("numbers only");
  });
});

// ---------------------------------------------------------------------------
// decision — action-selection rule and worked example (W2 [ACTION-SELECTION-RULE] / [DECISION-EXAMPLE])
// ---------------------------------------------------------------------------

describe("prompt-template-defaults — decision action-selection rule (W2 [ACTION-SELECTION-RULE])", () => {
  const body = DEFAULT_PROMPT_TEMPLATE_BODIES[FINAL_DECISION_TEMPLATE_KEY];

  it("contains the action selection rule requiring non-plain_reply for plan requests", () => {
    expect(body).toContain("ACTION SELECTION RULE");
    expect(body).toContain("plain_reply");
  });

  it("requires selecting the matching action when a candidate is available", () => {
    // The rule must forbid plain_reply when a matching domain candidate exists
    expect(body).toContain("MUST select");
  });

  it("contains a worked example with correct vs wrong output (W2 [DECISION-EXAMPLE])", () => {
    expect(body).toContain("WORKED EXAMPLE");
    expect(body).toContain("Correct output");
    expect(body).toContain("Wrong output");
    // The example must show create_workout_plan as the correct selectedAction
    expect(body).toContain('"selectedAction":"create_workout_plan"');
  });
});

describe("prompt-template-defaults — decision Slice 2: selection-by-ID (candidateProposalSummariesJson + selectedProposalIds)", () => {
  const body = DEFAULT_PROMPT_TEMPLATE_BODIES[FINAL_DECISION_TEMPLATE_KEY];

  it("references selectedProposalIds in the JSON shape instruction", () => {
    expect(body).toContain("selectedProposalIds");
  });

  it("instructs the model to pick candidate ids from the list (SELECTION-BY-ID)", () => {
    expect(body).toContain("candidateProposalSummariesJson");
    expect(body).toContain("{{candidateProposalSummariesJson}}");
  });

  it("includes recentMessagesJson placeholder for conversation history", () => {
    expect(body).toContain("{{recentMessagesJson}}");
  });

  it("explicitly forbids 'proposals' in output (FORBIDDEN FIELD)", () => {
    expect(body).toContain("FORBIDDEN FIELD");
    expect(body).toContain("proposals");
  });

  it("worked example shows selectedProposalIds array with a cand_ id, not a proposals array", () => {
    // The correct output example must use selectedProposalIds (not proposals)
    expect(body).toContain('"selectedProposalIds":["cand_workout_0"]');
    // Wrong output example for the FORBIDDEN proposals field must be present
    expect(body).toContain("FORBIDDEN");
  });

  it("instructs the model to NEVER include proposal payload objects", () => {
    expect(body).toContain("NEVER include proposal payload objects");
  });
});

// ---------------------------------------------------------------------------
// i18n — responseLanguage placeholder in REQUIRED_PLACEHOLDERS + rendering
// ---------------------------------------------------------------------------

describe("prompt-template-defaults — i18n: responseLanguage placeholder (domain + decision)", () => {
  const domainKeys = [
    DOMAIN_WORKOUT_TEMPLATE_KEY,
    DOMAIN_NUTRITION_TEMPLATE_KEY,
    DOMAIN_HEALTH_TEMPLATE_KEY,
  ] as const;

  for (const key of domainKeys) {
    it(`${key} PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS includes responseLanguage`, () => {
      expect(PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS[key]).toContain("responseLanguage");
    });

    it(`${key} template body contains {{responseLanguage}} placeholder`, () => {
      expect(DEFAULT_PROMPT_TEMPLATE_BODIES[key]).toContain("{{responseLanguage}}");
    });
  }

  it("decision template PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS includes responseLanguage", () => {
    expect(PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS[FINAL_DECISION_TEMPLATE_KEY]).toContain(
      "responseLanguage",
    );
  });

  it("decision template body contains {{responseLanguage}} placeholder", () => {
    expect(DEFAULT_PROMPT_TEMPLATE_BODIES[FINAL_DECISION_TEMPLATE_KEY]).toContain(
      "{{responseLanguage}}",
    );
  });
});

describe("prompt-template-renderer — renderDomainStep and renderFinalDecision render responseLanguage", () => {
  const compiled = compilePromptTemplates({ templates: {} });

  it("renderDomainStep renders the responseLanguage value into the workout prompt", () => {
    const rendered = compiled.renderDomainStep("workout", {
      domain: "workout",
      userMessage: "Составь план",
      iteration: "1",
      maxIterations: "3",
      priorToolResultsJson: "[]",
      coachingContextJson: "{}",
      allowedTools: "getUserContextSlice",
      allowedProposalIntents: "create_workout_plan",
      safetyFlags: "none",
      safetyConstraints: "none",
      attachmentContextJson: "none",
      responseLanguage: "ru",
      deepReviewSuffix: "",
    });

    expect(rendered).toContain("ru");
    expect(rendered).not.toContain("{{responseLanguage}}");
  });

  it("renderDomainStep renders the responseLanguage value into the nutrition prompt", () => {
    const rendered = compiled.renderDomainStep("nutrition", {
      domain: "nutrition",
      userMessage: "Составь план питания",
      iteration: "1",
      maxIterations: "3",
      priorToolResultsJson: "[]",
      coachingContextJson: "{}",
      allowedTools: "getUserContextSlice",
      allowedProposalIntents: "create_nutrition_plan",
      safetyFlags: "none",
      safetyConstraints: "none",
      attachmentContextJson: "none",
      responseLanguage: "ru",
      deepReviewSuffix: "",
    });

    expect(rendered).toContain("ru");
    expect(rendered).not.toContain("{{responseLanguage}}");
  });

  it("renderDomainStep renders the responseLanguage value into the health prompt", () => {
    const rendered = compiled.renderDomainStep("health", {
      domain: "health",
      userMessage: "Как мое здоровье?",
      iteration: "1",
      maxIterations: "3",
      priorToolResultsJson: "[]",
      coachingContextJson: "{}",
      allowedTools: "getUserContextSlice",
      allowedProposalIntents: "",
      safetyFlags: "none",
      safetyConstraints: "none",
      attachmentContextJson: "none",
      responseLanguage: "ru",
      deepReviewSuffix: "",
    });

    expect(rendered).toContain("ru");
    expect(rendered).not.toContain("{{responseLanguage}}");
  });

  it("renderFinalDecision renders the responseLanguage value into the decision prompt", () => {
    const rendered = compiled.renderFinalDecision({
      userMessage: "Составь план",
      domainOutputsJson: "[]",
      actionVariantCatalogJson: "[]",
      candidateProposalSummariesJson: "[]",
      recentMessagesJson: "[]",
      safetyFlags: "none",
      safetyConstraints: "none",
      responseLanguage: "ru",
      lowConfidenceRouteSuffix: "",
      deepReviewSuffix: "",
    });

    expect(rendered).toContain("ru");
    expect(rendered).not.toContain("{{responseLanguage}}");
  });
});

// ---------------------------------------------------------------------------
// PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS unchanged (W2 added no new placeholders)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fix 3 — Static prefix of each rendered template contains no unresolved {{}}
// The static prefix is everything up to the first per-turn dynamic marker.
// ---------------------------------------------------------------------------

describe("prompt-template-defaults — Fix 3: static prefix has no unresolved {{}} placeholders", () => {
  const compiled = compilePromptTemplates({ templates: {} });

  it("domain_workout static prefix (before 'Write all user-facing text') has no unresolved placeholders", () => {
    const rendered = compiled.renderDomainStep("workout", {
      domain: "workout",
      userMessage: "Test",
      iteration: "1",
      maxIterations: "3",
      priorToolResultsJson: "[]",
      coachingContextJson: "{}",
      allowedTools: "getUserContextSlice",
      allowedProposalIntents: "create_workout_plan",
      safetyFlags: "none",
      safetyConstraints: "none",
      attachmentContextJson: "none",
      responseLanguage: "en",
      deepReviewSuffix: "",
    });
    const splitMarker = "Write all user-facing text";
    const prefix = rendered.substring(0, rendered.indexOf(splitMarker));
    expect(prefix.length).toBeGreaterThan(100);
    expect(prefix).not.toMatch(/\{\{/);
  });

  it("domain_nutrition static prefix has no unresolved placeholders", () => {
    const rendered = compiled.renderDomainStep("nutrition", {
      domain: "nutrition",
      userMessage: "Test",
      iteration: "1",
      maxIterations: "3",
      priorToolResultsJson: "[]",
      coachingContextJson: "{}",
      allowedTools: "getUserContextSlice",
      allowedProposalIntents: "create_nutrition_plan",
      safetyFlags: "none",
      safetyConstraints: "none",
      attachmentContextJson: "none",
      responseLanguage: "en",
      deepReviewSuffix: "",
    });
    const splitMarker = "Write all user-facing text";
    const prefix = rendered.substring(0, rendered.indexOf(splitMarker));
    expect(prefix.length).toBeGreaterThan(100);
    expect(prefix).not.toMatch(/\{\{/);
  });

  it("domain_health static prefix has no unresolved placeholders", () => {
    const rendered = compiled.renderDomainStep("health", {
      domain: "health",
      userMessage: "Test",
      iteration: "1",
      maxIterations: "3",
      priorToolResultsJson: "[]",
      coachingContextJson: "{}",
      allowedTools: "getUserContextSlice",
      allowedProposalIntents: "",
      safetyFlags: "none",
      safetyConstraints: "none",
      attachmentContextJson: "none",
      responseLanguage: "en",
      deepReviewSuffix: "",
    });
    const splitMarker = "Write all user-facing text";
    const prefix = rendered.substring(0, rendered.indexOf(splitMarker));
    expect(prefix.length).toBeGreaterThan(100);
    expect(prefix).not.toMatch(/\{\{/);
  });

  it("decision static prefix (before 'Write all user-facing text') has no unresolved placeholders", () => {
    const rendered = compiled.renderFinalDecision({
      userMessage: "Test",
      domainOutputsJson: "[]",
      actionVariantCatalogJson: "[]",
      candidateProposalSummariesJson: "[]",
      recentMessagesJson: "[]",
      safetyFlags: "none",
      safetyConstraints: "none",
      responseLanguage: "en",
      lowConfidenceRouteSuffix: "",
      deepReviewSuffix: "",
    });
    const splitMarker = "Write all user-facing text";
    const prefix = rendered.substring(0, rendered.indexOf(splitMarker));
    expect(prefix.length).toBeGreaterThan(100);
    expect(prefix).not.toMatch(/\{\{/);
  });
});

describe("PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS — unchanged by W2", () => {
  it("router template still requires its original 8 placeholders", () => {
    const placeholders = PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS["router"];
    expect(placeholders).toContain("normalizedText");
    expect(placeholders).toContain("originalText");
    expect(placeholders).toContain("detectedLanguage");
    expect(placeholders).toContain("preprocessorJson");
    expect(placeholders).toContain("attachmentHintsJson");
    expect(placeholders).toContain("recentMessageHintsJson");
    expect(placeholders).toContain("availableDomainsJson");
    expect(placeholders).toContain("safetyGuardrailsJson");
    // Exactly 8 placeholders — no additions by W2
    expect(placeholders).toHaveLength(8);
  });

  it("domain_workout template requires its placeholders including responseLanguage", () => {
    const placeholders = PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS["domain_workout"];
    expect(placeholders).toContain("domain");
    expect(placeholders).toContain("userMessage");
    expect(placeholders).toContain("allowedProposalIntents");
    expect(placeholders).toContain("attachmentContextJson");
    expect(placeholders).toContain("responseLanguage");
    // Phase 4: deepReviewSuffix — injected as empty string on non-review turns
    expect(placeholders).toContain("deepReviewSuffix");
    // 13 placeholders — 11 original + responseLanguage (i18n) + deepReviewSuffix (Phase 4)
    expect(placeholders).toHaveLength(13);
  });

  it("decision template requires its placeholders including responseLanguage, Slice 2, and Slice 5 additions", () => {
    const placeholders = PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS["decision"];
    expect(placeholders).toContain("userMessage");
    expect(placeholders).toContain("domainOutputsJson");
    expect(placeholders).toContain("actionVariantCatalogJson");
    expect(placeholders).toContain("candidateProposalSummariesJson");
    expect(placeholders).toContain("recentMessagesJson");
    expect(placeholders).toContain("safetyFlags");
    expect(placeholders).toContain("safetyConstraints");
    expect(placeholders).toContain("responseLanguage");
    // Slice 5: lowConfidenceRouteSuffix — injected as empty string for confident routes
    expect(placeholders).toContain("lowConfidenceRouteSuffix");
    // Phase 4: deepReviewSuffix — injected as empty string on non-review turns
    expect(placeholders).toContain("deepReviewSuffix");
    // 10 placeholders: 8 (through Slice 2) + lowConfidenceRouteSuffix (Slice 5) + deepReviewSuffix (Phase 4)
    expect(placeholders).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// Slice 4 — Prompt-cache-friendly ordering
// Static prefix must be byte-identical across renders with different dynamic values.
// Dynamic placeholders must appear AFTER static content in each template.
// ---------------------------------------------------------------------------

describe("prompt-template-defaults — Slice 4: cache-friendly ordering (static prefix before dynamic suffix)", () => {
  describe("domain_workout: static rules precede dynamic values", () => {
    const body = DEFAULT_PROMPT_TEMPLATE_BODIES[DOMAIN_WORKOUT_TEMPLATE_KEY];

    it("CANDIDATE EMISSION RULE appears before coachingContextJson", () => {
      expect(body.indexOf("CANDIDATE EMISSION RULE")).toBeLessThan(body.indexOf("{{coachingContextJson}}"));
    });

    it("INTENT SELECTION RULE appears before userMessage", () => {
      expect(body.indexOf("INTENT SELECTION RULE")).toBeLessThan(body.indexOf("{{userMessage}}"));
    });

    it("DISPLAY CONTRACT INSTRUCTIONS appear before coachingContextJson", () => {
      expect(body.indexOf("DISPLAY CONTRACT INSTRUCTIONS")).toBeLessThan(body.indexOf("{{coachingContextJson}}"));
    });

    it("userMessage placeholder appears after coachingContextJson (largest dynamic block last)", () => {
      expect(body.indexOf("{{userMessage}}")).toBeGreaterThan(body.indexOf("{{coachingContextJson}}"));
    });
  });

  describe("domain_nutrition: static rules precede dynamic values", () => {
    const body = DEFAULT_PROMPT_TEMPLATE_BODIES[DOMAIN_NUTRITION_TEMPLATE_KEY];

    it("CANDIDATE EMISSION RULE appears before coachingContextJson", () => {
      expect(body.indexOf("CANDIDATE EMISSION RULE")).toBeLessThan(body.indexOf("{{coachingContextJson}}"));
    });

    it("food photo analysis instruction appears before coachingContextJson", () => {
      expect(body.indexOf("log_nutrition_incident proposal")).toBeLessThan(body.indexOf("{{coachingContextJson}}"));
    });

    it("userMessage placeholder appears after coachingContextJson", () => {
      expect(body.indexOf("{{userMessage}}")).toBeGreaterThan(body.indexOf("{{coachingContextJson}}"));
    });
  });

  describe("domain_health: static rules precede dynamic values", () => {
    const body = DEFAULT_PROMPT_TEMPLATE_BODIES[DOMAIN_HEALTH_TEMPLATE_KEY];

    it("BODY ANALYSIS RULE appears before coachingContextJson", () => {
      expect(body.indexOf("BODY ANALYSIS RULE")).toBeLessThan(body.indexOf("{{coachingContextJson}}"));
    });

    it("health context-only wording appears before userMessage", () => {
      expect(body.indexOf("Health domain is context-only")).toBeLessThan(body.indexOf("{{userMessage}}"));
    });

    it("userMessage placeholder appears after coachingContextJson", () => {
      expect(body.indexOf("{{userMessage}}")).toBeGreaterThan(body.indexOf("{{coachingContextJson}}"));
    });
  });

  describe("decision: static rules precede dynamic values", () => {
    const body = DEFAULT_PROMPT_TEMPLATE_BODIES[FINAL_DECISION_TEMPLATE_KEY];

    it("ACTION SELECTION RULE appears before domainOutputsJson", () => {
      expect(body.indexOf("ACTION SELECTION RULE")).toBeLessThan(body.indexOf("{{domainOutputsJson}}"));
    });

    it("WORKED EXAMPLE appears before domainOutputsJson", () => {
      expect(body.indexOf("WORKED EXAMPLE")).toBeLessThan(body.indexOf("{{domainOutputsJson}}"));
    });

    it("FORBIDDEN FIELD appears before domainOutputsJson", () => {
      expect(body.indexOf("FORBIDDEN FIELD")).toBeLessThan(body.indexOf("{{domainOutputsJson}}"));
    });

    it("userMessage placeholder is the last or near-last dynamic field", () => {
      const userMsgIdx = body.indexOf("{{userMessage}}");
      const domainIdx = body.indexOf("{{domainOutputsJson}}");
      const recentIdx = body.indexOf("{{recentMessagesJson}}");
      // userMessage should appear after domainOutputsJson and recentMessagesJson (large per-turn data)
      expect(userMsgIdx).toBeGreaterThan(domainIdx);
      expect(userMsgIdx).toBeGreaterThan(recentIdx);
    });
  });

  describe("cache-stable prefix: static content is byte-identical across renders with different dynamic values", () => {
    const compiled = compilePromptTemplates({ templates: {} });

    /**
     * Returns the stable prefix of a rendered string — everything up to the first
     * occurrence of a per-turn dynamic value. We use the rendered string to extract
     * the prefix because we want to confirm the instructions are identical.
     *
     * We simulate two different dynamic contexts and confirm the prefix matches.
     */
    it("domain_workout renders the same static prefix for two different user messages", () => {
      const baseValues = {
        domain: "workout",
        iteration: "1",
        maxIterations: "3",
        priorToolResultsJson: "none",
        coachingContextJson: "{}",
        allowedTools: "getUserContextSlice",
        allowedProposalIntents: "create_workout_plan",
        safetyFlags: "none",
        safetyConstraints: "none",
        attachmentContextJson: "none",
        responseLanguage: "en",
        deepReviewSuffix: "",
      };

      const render1 = compiled.renderDomainStep("workout", {
        ...baseValues,
        userMessage: "Make me a workout plan",
      });
      const render2 = compiled.renderDomainStep("workout", {
        ...baseValues,
        userMessage: "Составь план тренировок",
      });

      // Find the position of the first per-turn dynamic value (responseLanguage comes first in suffix)
      const splitMarker = "Write all user-facing text";
      const prefix1 = render1.substring(0, render1.indexOf(splitMarker));
      const prefix2 = render2.substring(0, render2.indexOf(splitMarker));

      expect(prefix1).toBe(prefix2);
      expect(prefix1.length).toBeGreaterThan(200);
    });

    it("domain_nutrition renders the same static prefix for two different user messages", () => {
      const baseValues = {
        domain: "nutrition",
        iteration: "1",
        maxIterations: "3",
        priorToolResultsJson: "none",
        coachingContextJson: "{}",
        allowedTools: "getUserContextSlice",
        allowedProposalIntents: "create_nutrition_plan",
        safetyFlags: "none",
        safetyConstraints: "none",
        attachmentContextJson: "none",
        responseLanguage: "en",
        deepReviewSuffix: "",
      };

      const render1 = compiled.renderDomainStep("nutrition", {
        ...baseValues,
        userMessage: "I want a nutrition plan",
      });
      const render2 = compiled.renderDomainStep("nutrition", {
        ...baseValues,
        userMessage: "Составь мне план питания",
      });

      const splitMarker = "Write all user-facing text";
      const prefix1 = render1.substring(0, render1.indexOf(splitMarker));
      const prefix2 = render2.substring(0, render2.indexOf(splitMarker));

      expect(prefix1).toBe(prefix2);
      expect(prefix1.length).toBeGreaterThan(200);
    });

    it("domain_health renders the same static prefix for two different user messages", () => {
      const baseValues = {
        domain: "health",
        iteration: "1",
        maxIterations: "3",
        priorToolResultsJson: "none",
        coachingContextJson: "{}",
        allowedTools: "getUserContextSlice",
        allowedProposalIntents: "",
        safetyFlags: "none",
        safetyConstraints: "none",
        attachmentContextJson: "none",
        responseLanguage: "en",
        deepReviewSuffix: "",
      };

      const render1 = compiled.renderDomainStep("health", {
        ...baseValues,
        userMessage: "How is my health?",
      });
      const render2 = compiled.renderDomainStep("health", {
        ...baseValues,
        userMessage: "Как мое здоровье?",
      });

      const splitMarker = "Write all user-facing text";
      const prefix1 = render1.substring(0, render1.indexOf(splitMarker));
      const prefix2 = render2.substring(0, render2.indexOf(splitMarker));

      expect(prefix1).toBe(prefix2);
      expect(prefix1.length).toBeGreaterThan(200);
    });

    it("decision renders the same static prefix for two different user messages", () => {
      const baseValues = {
        domainOutputsJson: "[]",
        actionVariantCatalogJson: "[]",
        candidateProposalSummariesJson: "[]",
        recentMessagesJson: "[]",
        safetyFlags: "none",
        safetyConstraints: "none",
        responseLanguage: "en",
        lowConfidenceRouteSuffix: "",
        deepReviewSuffix: "",
      };

      const render1 = compiled.renderFinalDecision({
        ...baseValues,
        userMessage: "Give me a plan",
      });
      const render2 = compiled.renderFinalDecision({
        ...baseValues,
        userMessage: "Составь мне план",
      });

      // Static prefix ends before the dynamic suffix starts
      // The WORKED EXAMPLE is part of the static prefix
      const splitMarker = "Write all user-facing text";
      const prefix1 = render1.substring(0, render1.indexOf(splitMarker));
      const prefix2 = render2.substring(0, render2.indexOf(splitMarker));

      expect(prefix1).toBe(prefix2);
      expect(prefix1.length).toBeGreaterThan(200);
    });

    it("decision lowConfidenceRouteSuffix does NOT appear in the static prefix (suffix-only placement)", () => {
      const splitMarker = "Write all user-facing text";

      const confidenceRender = compiled.renderFinalDecision({
        userMessage: "Test",
        domainOutputsJson: "[]",
        actionVariantCatalogJson: "[]",
        candidateProposalSummariesJson: "[]",
        recentMessagesJson: "[]",
        safetyFlags: "none",
        safetyConstraints: "none",
        responseLanguage: "en",
        lowConfidenceRouteSuffix: "ROUTING NOTE: low confidence",
        deepReviewSuffix: "",
      });

      const emptyRender = compiled.renderFinalDecision({
        userMessage: "Test",
        domainOutputsJson: "[]",
        actionVariantCatalogJson: "[]",
        candidateProposalSummariesJson: "[]",
        recentMessagesJson: "[]",
        safetyFlags: "none",
        safetyConstraints: "none",
        responseLanguage: "en",
        lowConfidenceRouteSuffix: "",
        deepReviewSuffix: "",
      });

      // Static prefix must be byte-identical regardless of the suffix flag.
      const prefix1 = confidenceRender.substring(0, confidenceRender.indexOf(splitMarker));
      const prefix2 = emptyRender.substring(0, emptyRender.indexOf(splitMarker));
      expect(prefix1).toBe(prefix2);

      // The routing note must appear in the suffixed render (after the split marker).
      const suffix = confidenceRender.substring(confidenceRender.indexOf(splitMarker));
      expect(suffix).toContain("ROUTING NOTE: low confidence");

      // And must NOT appear when the suffix is empty.
      expect(emptyRender).not.toContain("ROUTING NOTE: low confidence");
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 4 — deep-review suffix placement + static metric legend
// ---------------------------------------------------------------------------

/**
 * First per-turn dynamic line of each template body — everything before it is
 * the STATIC prefix (must stay byte-stable and placeholder-free).
 */
const STATIC_PREFIX_END_MARKERS: Record<PromptTemplateKey, string> = {
  [ROUTER_DECISION_TEMPLATE_KEY]: "Normalized user message:",
  [DOMAIN_WORKOUT_TEMPLATE_KEY]: "Write all user-facing text",
  [DOMAIN_NUTRITION_TEMPLATE_KEY]: "Write all user-facing text",
  [DOMAIN_HEALTH_TEMPLATE_KEY]: "Write all user-facing text",
  [FINAL_DECISION_TEMPLATE_KEY]: "Write all user-facing text",
};

const FAN_OUT_TEMPLATE_KEYS = [
  DOMAIN_WORKOUT_TEMPLATE_KEY,
  DOMAIN_NUTRITION_TEMPLATE_KEY,
  DOMAIN_HEALTH_TEMPLATE_KEY,
  FINAL_DECISION_TEMPLATE_KEY,
] as const;

describe("prompt-template-defaults — Phase 4: static prefixes are placeholder-free", () => {
  const allKeys = Object.keys(STATIC_PREFIX_END_MARKERS) as PromptTemplateKey[];

  for (const key of allKeys) {
    it(`${key} static prefix contains NO {{...}} placeholder`, () => {
      const body = DEFAULT_PROMPT_TEMPLATE_BODIES[key];
      const markerIndex = body.indexOf(STATIC_PREFIX_END_MARKERS[key]);
      expect(markerIndex).toBeGreaterThan(0);

      const staticPrefix = body.substring(0, markerIndex);
      expect(staticPrefix.length).toBeGreaterThan(100);
      expect(staticPrefix).not.toMatch(/\{\{/);
    });
  }
});

describe("prompt-template-defaults — Phase 4: {{deepReviewSuffix}} placement", () => {
  for (const key of FAN_OUT_TEMPLATE_KEYS) {
    it(`${key} carries {{deepReviewSuffix}} in the dynamic suffix only`, () => {
      const body = DEFAULT_PROMPT_TEMPLATE_BODIES[key];
      const markerIndex = body.indexOf(STATIC_PREFIX_END_MARKERS[key]);
      const suffixIndex = body.indexOf("{{deepReviewSuffix}}");

      expect(suffixIndex).toBeGreaterThan(-1);
      // The placeholder must live AFTER the static prefix ends (suffix-only).
      expect(suffixIndex).toBeGreaterThan(markerIndex);
    });
  }

  it("router template does NOT carry {{deepReviewSuffix}} (router never coaches)", () => {
    expect(DEFAULT_PROMPT_TEMPLATE_BODIES[ROUTER_DECISION_TEMPLATE_KEY]).not.toContain(
      "deepReviewSuffix",
    );
  });
});

describe("prompt-template-defaults — Phase 4: static metric legend in prefixes", () => {
  it("legend block is built from the EN legend and is placeholder-free", () => {
    expect(PROGRESS_HISTORY_METRIC_LEGEND_PROMPT_BLOCK).not.toMatch(/\{\{/);
    expect(PROGRESS_HISTORY_METRIC_LEGEND_PROMPT_BLOCK).toContain(
      PROGRESS_HISTORY_METRIC_LEGEND.en.workoutAdherencePercent,
    );
    expect(PROGRESS_HISTORY_METRIC_LEGEND_PROMPT_BLOCK).toContain(
      PROGRESS_HISTORY_METRIC_LEGEND.en.avgMoodScore,
    );
    // One language only (EN) keeps the prefix static; no RU legend text leaks in.
    expect(PROGRESS_HISTORY_METRIC_LEGEND_PROMPT_BLOCK).not.toContain(
      PROGRESS_HISTORY_METRIC_LEGEND.ru.workoutAdherencePercent,
    );
  });

  for (const key of FAN_OUT_TEMPLATE_KEYS) {
    it(`${key} carries the metric legend inside the STATIC prefix`, () => {
      const body = DEFAULT_PROMPT_TEMPLATE_BODIES[key];
      const markerIndex = body.indexOf(STATIC_PREFIX_END_MARKERS[key]);
      const legendIndex = body.indexOf("PROGRESS HISTORY METRIC LEGEND");

      expect(legendIndex).toBeGreaterThan(-1);
      expect(legendIndex).toBeLessThan(markerIndex);
      expect(body).toContain(PROGRESS_HISTORY_METRIC_LEGEND_PROMPT_BLOCK);
    });
  }

  it("router template does NOT carry the metric legend", () => {
    expect(DEFAULT_PROMPT_TEMPLATE_BODIES[ROUTER_DECISION_TEMPLATE_KEY]).not.toContain(
      "PROGRESS HISTORY METRIC LEGEND",
    );
  });
});

describe("prompt-template-defaults — Phase 4: deepReviewSuffix render behavior", () => {
  const compiled = compilePromptTemplates({ templates: {} });
  const splitMarker = "Write all user-facing text";

  it("decision deepReviewSuffix renders in the suffix only and never alters the static prefix", () => {
    const baseValues = {
      userMessage: "Test",
      domainOutputsJson: "[]",
      actionVariantCatalogJson: "[]",
      candidateProposalSummariesJson: "[]",
      recentMessagesJson: "[]",
      safetyFlags: "none",
      safetyConstraints: "none",
      responseLanguage: "en",
      lowConfidenceRouteSuffix: "",
    };

    const reviewRender = compiled.renderFinalDecision({
      ...baseValues,
      deepReviewSuffix: "DEEP REVIEW NOTE: test marker",
    });
    const defaultRender = compiled.renderFinalDecision({
      ...baseValues,
      deepReviewSuffix: "",
    });

    const prefix1 = reviewRender.substring(0, reviewRender.indexOf(splitMarker));
    const prefix2 = defaultRender.substring(0, defaultRender.indexOf(splitMarker));
    expect(prefix1).toBe(prefix2);

    expect(reviewRender.substring(reviewRender.indexOf(splitMarker))).toContain(
      "DEEP REVIEW NOTE: test marker",
    );
    expect(defaultRender).not.toContain("DEEP REVIEW NOTE");
  });

  it("domain_workout deepReviewSuffix renders in the suffix only and never alters the static prefix", () => {
    const baseValues = {
      domain: "workout",
      userMessage: "Test",
      iteration: "1",
      maxIterations: "3",
      priorToolResultsJson: "[]",
      coachingContextJson: "{}",
      allowedTools: "getProgressHistory",
      allowedProposalIntents: "adapt_workout_plan_from_progress",
      safetyFlags: "none",
      safetyConstraints: "none",
      attachmentContextJson: "none",
      responseLanguage: "en",
    };

    const reviewRender = compiled.renderDomainStep("workout", {
      ...baseValues,
      deepReviewSuffix: "DEEP REVIEW NOTE: test marker",
    });
    const defaultRender = compiled.renderDomainStep("workout", {
      ...baseValues,
      deepReviewSuffix: "",
    });

    const prefix1 = reviewRender.substring(0, reviewRender.indexOf(splitMarker));
    const prefix2 = defaultRender.substring(0, defaultRender.indexOf(splitMarker));
    expect(prefix1).toBe(prefix2);

    expect(reviewRender.substring(reviewRender.indexOf(splitMarker))).toContain(
      "DEEP REVIEW NOTE: test marker",
    );
    expect(defaultRender).not.toContain("DEEP REVIEW NOTE");
  });
});
