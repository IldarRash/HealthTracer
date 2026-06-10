import { describe, expect, it } from "vitest";
import {
  compilePromptTemplates,
  renderPromptTemplateBody,
  validatePromptTemplateBody,
} from "./prompt-template-renderer.js";

describe("prompt template renderer", () => {
  it("falls back safely when a router config template is invalid", () => {
    const compiled = compilePromptTemplates({
      templates: {
        router: {
          templateKey: "router",
          body: "Missing placeholder",
          placeholders: [],
        },
      },
    });
    expect(compiled.templates.router.source).toBe("default");
    expect(validatePromptTemplateBody("router", "Missing placeholder").length).toBeGreaterThan(0);
  });

  it("returns null when render values are incomplete", () => {
    const rendered = renderPromptTemplateBody("Coach {{coachingContextJson}}", {});

    expect(rendered).toBeNull();
  });

});
