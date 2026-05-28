import { describe, expect, it } from "vitest";
import { buildDefaultAiBehaviorConfig } from "./ai-behavior-config.js";
import {
  compilePromptTemplates,
  renderPromptTemplateBody,
  validatePromptTemplateBody,
} from "./prompt-template-renderer.js";

describe("prompt template renderer", () => {
  it("renders default router template with required placeholders", () => {
    const compiled = compilePromptTemplates(buildDefaultAiBehaviorConfig().promptTemplates);
    const rendered = compiled.renderIntentRouter({
      intentCatalogJson: '[{"id":"general"}]',
    });

    expect(rendered).toContain("internal intent router");
    expect(rendered).toContain('[{"id":"general"}]');
  });

  it("uses config template overrides without code changes", () => {
    const compiled = compilePromptTemplates({
      templates: {
        openai_intent_router: {
          templateKey: "openai_intent_router",
          body: "Router override {{intentCatalogJson}}",
          placeholders: ["intentCatalogJson"],
        },
      },
    });

    expect(compiled.renderIntentRouter({ intentCatalogJson: "[]" })).toBe("Router override []");
  });

  it("falls back safely when config template is invalid", () => {
    const compiled = compilePromptTemplates({
      templates: {
        openai_intent_router: {
          templateKey: "openai_intent_router",
          body: "Missing placeholder",
          placeholders: [],
        },
      },
    });
    const rendered = compiled.renderIntentRouter({ intentCatalogJson: "[]" });

    expect(rendered).toContain("internal intent router");
    expect(rendered).toContain("[]");
    expect(validatePromptTemplateBody("openai_intent_router", "Missing placeholder").length).toBe(
      1,
    );
  });

  it("returns null when render values are incomplete", () => {
    const rendered = renderPromptTemplateBody("Router {{intentCatalogJson}}", {});

    expect(rendered).toBeNull();
  });
});
