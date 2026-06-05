/**
 * W4 tests — prompt-template-defaults (Workstream 2 markers)
 *
 * Asserts that the fan-out template bodies contain the language-match
 * instruction and the new payload/routing markers W2 added. Also asserts
 * that PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS is unchanged (W2 added no new
 * required placeholders).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROMPT_TEMPLATE_BODIES,
  PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS,
  ROUTER_DECISION_TEMPLATE_KEY,
  DOMAIN_WORKOUT_TEMPLATE_KEY,
  DOMAIN_NUTRITION_TEMPLATE_KEY,
  DOMAIN_HEALTH_TEMPLATE_KEY,
  FINAL_DECISION_TEMPLATE_KEY,
} from "./prompt-template-defaults.js";

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
      // The instruction should mention writing in the user's language.
      const hasLangInstruction =
        body.includes("user's language") || body.includes("detectedLanguage");
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

  it("instructs health domain to always return empty candidateProposals", () => {
    expect(body).toContain("candidateProposals:[]");
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

// ---------------------------------------------------------------------------
// PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS unchanged (W2 added no new placeholders)
// ---------------------------------------------------------------------------

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

  it("domain_workout template still requires its original 11 placeholders", () => {
    const placeholders = PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS["domain_workout"];
    expect(placeholders).toContain("domain");
    expect(placeholders).toContain("userMessage");
    expect(placeholders).toContain("allowedProposalIntents");
    expect(placeholders).toContain("attachmentContextJson");
    // 11 placeholders — no additions by W2
    expect(placeholders).toHaveLength(11);
  });

  it("decision template still requires its original 5 placeholders", () => {
    const placeholders = PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS["decision"];
    expect(placeholders).toContain("userMessage");
    expect(placeholders).toContain("domainOutputsJson");
    expect(placeholders).toContain("actionVariantCatalogJson");
    expect(placeholders).toContain("safetyFlags");
    expect(placeholders).toContain("safetyConstraints");
    // Exactly 5 — no additions by W2
    expect(placeholders).toHaveLength(5);
  });
});
