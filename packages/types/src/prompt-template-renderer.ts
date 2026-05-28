import type { PromptTemplatesBehaviorConfig } from "./ai-behavior-config.js";
import {
  DEFAULT_PROMPT_TEMPLATE_BODIES,
  OPENAI_COACH_LOOP_TEMPLATE_KEY,
  OPENAI_INTENT_ROUTER_TEMPLATE_KEY,
  PROMPT_TEMPLATE_KEYS,
  PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS,
  type PromptTemplateKey,
} from "./prompt-template-defaults.js";

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

export type PromptTemplateRenderValues = Record<string, string>;

export type CompiledPromptTemplate = {
  readonly templateKey: PromptTemplateKey;
  readonly body: string;
  readonly source: "config" | "default";
  render(values: PromptTemplateRenderValues): string | null;
};

export type CompiledPromptTemplates = {
  readonly templates: Readonly<Record<PromptTemplateKey, CompiledPromptTemplate>>;
  renderIntentRouter(values: { intentCatalogJson: string }): string;
  renderCoachLoop(values: PromptTemplateRenderValues): string;
};

export function validatePromptTemplateBody(
  templateKey: PromptTemplateKey,
  body: string,
): string[] {
  const errors: string[] = [];
  const required = PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS[templateKey];
  const found = new Set<string>();

  for (const match of body.matchAll(PLACEHOLDER_PATTERN)) {
    const placeholder = match[1];

    if (placeholder) {
      found.add(placeholder);
    }
  }

  for (const placeholder of required) {
    if (!found.has(placeholder)) {
      errors.push(`missing required placeholder {{${placeholder}}}`);
    }
  }

  for (const placeholder of found) {
    if (!required.includes(placeholder)) {
      errors.push(`unsupported placeholder {{${placeholder}}}`);
    }
  }

  return errors;
}

export function renderPromptTemplateBody(
  body: string,
  values: PromptTemplateRenderValues,
): string | null {
  let unresolved = false;

  const rendered = body.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
    if (!(key in values)) {
      unresolved = true;
      return match;
    }

    return values[key] ?? "";
  });

  if (unresolved || PLACEHOLDER_PATTERN.test(rendered)) {
    return null;
  }

  return rendered;
}

function compilePromptTemplate(
  templateKey: PromptTemplateKey,
  configBody: string | undefined,
): CompiledPromptTemplate {
  const defaultBody = DEFAULT_PROMPT_TEMPLATE_BODIES[templateKey];
  const candidateBody = configBody?.trim() ? configBody : defaultBody;
  const validationErrors = validatePromptTemplateBody(templateKey, candidateBody);
  const body = validationErrors.length > 0 ? defaultBody : candidateBody;
  const source = validationErrors.length > 0 || !configBody?.trim() ? "default" : "config";

  return {
    templateKey,
    body,
    source,
    render(values) {
      const rendered = renderPromptTemplateBody(this.body, values);

      if (rendered == null) {
        return renderPromptTemplateBody(defaultBody, values);
      }

      return rendered;
    },
  };
}

export function compilePromptTemplates(
  config: PromptTemplatesBehaviorConfig,
): CompiledPromptTemplates {
  const templates = Object.fromEntries(
    PROMPT_TEMPLATE_KEYS.map((templateKey) => {
      const entry = config.templates[templateKey];
      return [templateKey, compilePromptTemplate(templateKey, entry?.body)] as const;
    }),
  ) as Record<PromptTemplateKey, CompiledPromptTemplate>;

  return {
    templates,
    renderIntentRouter(values) {
      const rendered = templates[OPENAI_INTENT_ROUTER_TEMPLATE_KEY].render({
        intentCatalogJson: values.intentCatalogJson,
      });

      return rendered ?? DEFAULT_PROMPT_TEMPLATE_BODIES[OPENAI_INTENT_ROUTER_TEMPLATE_KEY].replace(
        "{{intentCatalogJson}}",
        values.intentCatalogJson,
      );
    },
    renderCoachLoop(values) {
      const rendered = templates[OPENAI_COACH_LOOP_TEMPLATE_KEY].render(values);

      if (rendered != null) {
        return rendered;
      }

      return renderPromptTemplateBody(
        DEFAULT_PROMPT_TEMPLATE_BODIES[OPENAI_COACH_LOOP_TEMPLATE_KEY],
        values,
      )!;
    },
  };
}

let cachedDefaultPromptTemplates: CompiledPromptTemplates | null = null;

export function getDefaultCompiledPromptTemplates(): CompiledPromptTemplates {
  if (cachedDefaultPromptTemplates == null) {
    cachedDefaultPromptTemplates = compilePromptTemplates({ templates: {} });
  }

  return cachedDefaultPromptTemplates;
}

export function buildDefaultPromptTemplateEntries(): PromptTemplatesBehaviorConfig["templates"] {
  return Object.fromEntries(
    PROMPT_TEMPLATE_KEYS.map((templateKey) => [
      templateKey,
      {
        templateKey,
        body: DEFAULT_PROMPT_TEMPLATE_BODIES[templateKey],
        placeholders: [...PROMPT_TEMPLATE_REQUIRED_PLACEHOLDERS[templateKey]],
      },
    ]),
  );
}
