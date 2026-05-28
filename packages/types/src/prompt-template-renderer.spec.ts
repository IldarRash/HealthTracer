import { describe, expect, it } from "vitest";
import { buildDefaultAiBehaviorConfig } from "./ai-behavior-config.js";
import {
  compilePromptTemplates,
  renderPromptTemplateBody,
  validatePromptTemplateBody,
} from "./prompt-template-renderer.js";

describe("prompt template renderer", () => {
  it("uses config template overrides without code changes", () => {
    const compiled = compilePromptTemplates({
      templates: {
        openai_coach_loop: {
          templateKey: "openai_coach_loop",
          body: [
            "Coach override {{iteration}}/{{maxIterations}}",
            "{{selectedIntentLabel}} {{intentInstructions}} {{intentSafetyGuidance}}",
            "{{allowedTools}} {{allowedProposalIntents}} {{taskPurpose}} {{taskIntent}}",
            "{{expectedResponseMode}} {{safetyFlags}} {{missingContextNotes}}",
            "{{priorToolResultsJson}} {{safetyConstraints}} {{coachingContextJson}}",
          ].join(" "),
          placeholders: [
            "iteration",
            "maxIterations",
            "selectedIntentLabel",
            "intentInstructions",
            "intentSafetyGuidance",
            "allowedTools",
            "allowedProposalIntents",
            "taskPurpose",
            "taskIntent",
            "expectedResponseMode",
            "safetyFlags",
            "missingContextNotes",
            "priorToolResultsJson",
            "safetyConstraints",
            "coachingContextJson",
          ],
        },
      },
    });

    expect(
      compiled.renderCoachLoop({
        iteration: "1",
        maxIterations: "3",
        selectedIntentLabel: "general",
        intentInstructions: "Coach",
        intentSafetyGuidance: "none",
        allowedTools: "getUserContextSlice",
        allowedProposalIntents: "none",
        taskPurpose: "general_chat",
        taskIntent: "general",
        expectedResponseMode: "advice_only",
        safetyFlags: "none",
        missingContextNotes: "none",
        priorToolResultsJson: "none",
        safetyConstraints: "Stay conservative",
        coachingContextJson: '{"focus":"recovery"}',
      }),
    ).toContain('{"focus":"recovery"}');
    expect(compiled.templates.openai_coach_loop.source).toBe("config");
  });

  it("falls back safely when config coach template is invalid", () => {
    const compiled = compilePromptTemplates({
      templates: {
        openai_coach_loop: {
          templateKey: "openai_coach_loop",
          body: "Missing placeholder",
          placeholders: [],
        },
      },
    });
    const rendered = compiled.renderCoachLoop({
      iteration: "1",
      maxIterations: "3",
      selectedIntentLabel: "general",
      intentInstructions: "Coach",
      intentSafetyGuidance: "none",
      allowedTools: "getUserContextSlice",
      allowedProposalIntents: "none",
      taskPurpose: "general_chat",
      taskIntent: "general",
      expectedResponseMode: "advice_only",
      safetyFlags: "none",
      missingContextNotes: "none",
      priorToolResultsJson: "none",
      safetyConstraints: "Stay conservative",
      coachingContextJson: "{}",
    });

    expect(rendered).toContain("AI wellness coach");
    expect(validatePromptTemplateBody("openai_coach_loop", "Missing placeholder").length).toBeGreaterThan(
      0,
    );
  });

  it("returns null when render values are incomplete", () => {
    const rendered = renderPromptTemplateBody("Coach {{coachingContextJson}}", {});

    expect(rendered).toBeNull();
  });

  it("renders default message understanding template with required placeholders", () => {
    const compiled = compilePromptTemplates(buildDefaultAiBehaviorConfig().promptTemplates);
    const rendered = compiled.renderMessageUnderstanding({
      normalizedText: "should i train today?",
      originalText: "Should I train today?",
      preprocessorJson: '{"simpleSignals":{"workout":true}}',
      attachmentContextSummariesJson: "[]",
      recentMessageHintsJson: "[]",
      catalogHintsJson: '[{"id":"general"}]',
    });

    expect(rendered).toContain("message understanding analyzer");
    expect(rendered).toContain("should i train today?");
    expect(rendered).toContain('[{"id":"general"}]');
  });
});
