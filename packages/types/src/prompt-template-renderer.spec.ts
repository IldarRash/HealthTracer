import { describe, expect, it } from "vitest";
import {
  compilePromptTemplates,
  renderPromptTemplateBody,
  validatePromptTemplateBody,
} from "./prompt-template-renderer.js";

// openai_coach_loop / renderCoachLoop removed: the legacy single-LLM coach loop was
// replaced by the multi-domain fan-out pipeline. All live rendering goes through
// renderRouterDecision, renderDomainStep, renderFinalDecision.

describe("prompt template renderer", () => {
  it("renderRouterDecision uses config override when valid", () => {
    const routerBody = [
      "Custom router {{normalizedText}} {{originalText}}",
      "{{detectedLanguage}} {{preprocessorJson}} {{attachmentHintsJson}}",
      "{{recentMessageHintsJson}} {{availableDomainsJson}} {{safetyGuardrailsJson}}",
    ].join(" ");

    const compiled = compilePromptTemplates({
      templates: {
        router: {
          templateKey: "router",
          body: routerBody,
          placeholders: [
            "normalizedText",
            "originalText",
            "detectedLanguage",
            "preprocessorJson",
            "attachmentHintsJson",
            "recentMessageHintsJson",
            "availableDomainsJson",
            "safetyGuardrailsJson",
          ],
        },
      },
    });

    const rendered = compiled.renderRouterDecision({
      normalizedText: "create a plan",
      originalText: "Create a plan",
      detectedLanguage: "en",
      preprocessorJson: "{}",
      attachmentHintsJson: "[]",
      recentMessageHintsJson: "[]",
      availableDomainsJson: "[]",
      safetyGuardrailsJson: "[]",
    });

    expect(rendered).toContain("Custom router");
    expect(compiled.templates.router.source).toBe("config");
  });

  it("renderRouterDecision falls back to default when config body is invalid", () => {
    const compiled = compilePromptTemplates({
      templates: {
        router: {
          templateKey: "router",
          body: "Missing all required placeholders",
          placeholders: [],
        },
      },
    });

    const rendered = compiled.renderRouterDecision({
      normalizedText: "test",
      originalText: "test",
      detectedLanguage: "en",
      preprocessorJson: "{}",
      attachmentHintsJson: "[]",
      recentMessageHintsJson: "[]",
      availableDomainsJson: "[]",
      safetyGuardrailsJson: "[]",
    });

    expect(rendered).toContain("domain router");
    expect(compiled.templates.router.source).toBe("default");
  });

  it("renderFinalDecision uses default template", () => {
    const compiled = compilePromptTemplates({ templates: {} });

    const rendered = compiled.renderFinalDecision({
      userMessage: "Create a plan",
      domainOutputsJson: "{}",
      actionVariantCatalogJson: "[]",
      candidateProposalSummariesJson: "[]",
      recentMessagesJson: "[]",
      safetyFlags: "none",
      safetyConstraints: "Stay conservative",
      responseLanguage: "en",
      lowConfidenceRouteSuffix: "",
      deepReviewSuffix: "",
    });

    expect(rendered).toContain("wellness coach");
    expect(rendered).toContain("Create a plan");
  });

  it("renderDomainStep uses default workout template", () => {
    const compiled = compilePromptTemplates({ templates: {} });

    const rendered = compiled.renderDomainStep("workout", {
      domain: "workout",
      userMessage: "Build me a plan",
      iteration: "1",
      maxIterations: "3",
      priorToolResultsJson: "[]",
      coachingContextJson: "{}",
      allowedTools: "getUserContextSlice",
      allowedProposalIntents: "create_workout_plan",
      safetyFlags: "none",
      safetyConstraints: "Never diagnose.",
      attachmentContextJson: "none",
      responseLanguage: "en",
      deepReviewSuffix: "",
    });

    expect(rendered).toContain("workout");
    expect(rendered).toContain("Build me a plan");
  });

  it("openai_coach_loop is not a recognized template key", () => {
    const compiled = compilePromptTemplates({ templates: {} });

    // The templates record only contains the live pipeline keys
    expect("openai_coach_loop" in compiled.templates).toBe(false);
  });

  it("renderCoachLoop is not a method on CompiledPromptTemplates", () => {
    const compiled = compilePromptTemplates({ templates: {} });

    // renderCoachLoop was removed with the legacy single-LLM coach loop
    expect("renderCoachLoop" in compiled).toBe(false);
  });

  it("returns null when render values are incomplete", () => {
    const rendered = renderPromptTemplateBody("Coach {{coachingContextJson}}", {});

    expect(rendered).toBeNull();
  });

  it("validatePromptTemplateBody detects missing required placeholder", () => {
    const errors = validatePromptTemplateBody("router", "No placeholders here");

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("normalizedText"))).toBe(true);
  });
});
