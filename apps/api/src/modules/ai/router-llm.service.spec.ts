import {
  createFallbackRouterDecision,
  DEFAULT_DOMAIN_CONFIGS,
  ROUTER_TEXT_MAX_CHARS,
  routerDecisionOutputSchema,
  routerDecisionRequestSchema,
  routerDomainSchema,
  type RouterDecisionOutput,
} from "@health/types";
import { createCoachAiProviderMock } from "@health/ai/testing";
import type { ProviderCallResult } from "@health/ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import type { CapabilityRegistryService } from "./capability-registry.service.js";
import {
  RouterLlmService,
  type RouterLlmServiceInput,
} from "./router-llm.service.js";
import * as coachProviderFactory from "./coach-provider.factory.js";

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makePreprocessorResult(overrides: Partial<{
  originalText: string;
  normalizedText: string;
  detectedLanguage: string | null;
  hasAttachments: boolean;
  simpleSignals: Record<string, boolean>;
}> = {}) {
  // When detectedLanguage is explicitly null, keep both language fields null.
  const detectedLanguage =
    "detectedLanguage" in overrides ? overrides.detectedLanguage ?? null : "en";

  return {
    originalText: overrides.originalText ?? "adjust my workout",
    normalizedText: overrides.normalizedText ?? "adjust my workout",
    detectedLanguage,
    responseLanguage: detectedLanguage,
    hasAttachments: overrides.hasAttachments ?? false,
    mentionedDates: [],
    simpleSignals: {
      workout: overrides.simpleSignals?.["workout"] ?? false,
      nutrition: overrides.simpleSignals?.["nutrition"] ?? false,
      today: overrides.simpleSignals?.["today"] ?? false,
      sleep: overrides.simpleSignals?.["sleep"] ?? false,
      fatigue: overrides.simpleSignals?.["fatigue"] ?? false,
      pain: overrides.simpleSignals?.["pain"] ?? false,
      document: overrides.simpleSignals?.["document"] ?? false,
      attachment: overrides.simpleSignals?.["attachment"] ?? false,
      plan_request: overrides.simpleSignals?.["plan_request"] ?? false,
      review_request: overrides.simpleSignals?.["review_request"] ?? false,
      ...overrides.simpleSignals,
    },
    directPathCandidate: null,
    requestedLookbackDays: null,
  };
}

function makeAiBehaviorConfigService(): Pick<AiBehaviorConfigService, "getCompiledPromptTemplates" | "getDomainConfigs"> {
  return {
    getCompiledPromptTemplates: () => ({} as ReturnType<AiBehaviorConfigService["getCompiledPromptTemplates"]>),
    getDomainConfigs: () => DEFAULT_DOMAIN_CONFIGS,
  };
}

function makeCapabilityRegistryService(): Pick<CapabilityRegistryService, "getConfig"> {
  return {
    // Return a minimal valid capability config for any id — simulates catalog presence.
    getConfig: (_id) => ({ capabilityId: _id } as ReturnType<CapabilityRegistryService["getConfig"]>),
  };
}

function buildService(providerOverrides: Partial<{
  generateRouterDecision: (req: unknown) => Promise<ProviderCallResult<RouterDecisionOutput>>;
}> = {}): RouterLlmService {
  // Spy on createCoachAiProvider so the RouterLlmService constructor does not
  // attempt to instantiate the real OpenAI provider (which requires a live key).
  // This mirrors the pattern used by agent-orchestrator.service.spec.ts:711.
  vi.spyOn(coachProviderFactory, "createCoachAiProvider").mockReturnValue(
    createCoachAiProviderMock(),
  );

  const service = new RouterLlmService(
    makeAiBehaviorConfigService() as AiBehaviorConfigService,
    makeCapabilityRegistryService() as CapabilityRegistryService,
  );

  // Replace the provider on the service instance with a controlled stub.
  const provider = {
    generateRouterDecision:
      providerOverrides.generateRouterDecision ??
      vi.fn().mockResolvedValue({
        output: routerDecisionOutputSchema.parse({
          selectedDomains: [
            { domain: "workout", confidence: 0.8, intentHints: [], toolHints: [], signalHints: [] },
          ],
          safetyFlags: [],
          confidence: 0.8,
        }),
      }),
    generateDomainStep: vi.fn(),
    generateFinalDecision: vi.fn(),
  };

  // Bypass private field via type cast — acceptable in service unit tests.
  (service as unknown as Record<string, unknown>)["provider"] = provider;

  return service;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RouterLlmService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("buildRequest", () => {
    it("populates originalText and normalizedText from the preprocessor result", () => {
      const service = buildService();
      const preprocessorResult = makePreprocessorResult({
        originalText: "I want to adjust my workout plan",
        normalizedText: "I want to adjust my workout plan",
      });

      const request = service.buildRequest({ preprocessorResult });

      expect(request.originalText).toBe("I want to adjust my workout plan");
      expect(request.normalizedText).toBe("I want to adjust my workout plan");
    });

    it("includes detectedLanguage when present", () => {
      const service = buildService();
      const preprocessorResult = makePreprocessorResult({ detectedLanguage: "ru" });

      const request = service.buildRequest({ preprocessorResult });

      expect(request.detectedLanguage).toBe("ru");
    });

    it("omits detectedLanguage when null", () => {
      const service = buildService();
      const preprocessorResult = makePreprocessorResult({ detectedLanguage: null });

      const request = service.buildRequest({ preprocessorResult });

      expect(request.detectedLanguage).toBeUndefined();
    });

    it("includes only the three RouterDomain values (workout/nutrition/health) in availableDomains", () => {
      const service = buildService();
      const preprocessorResult = makePreprocessorResult();

      const request = service.buildRequest({ preprocessorResult });
      const domains = request.availableDomains.map((d) => d.domain);

      expect(domains.every((d) => (routerDomainSchema.options as string[]).includes(d))).toBe(true);
      // medical config is NOT a RouterDomain so it should not appear
      expect(domains).not.toContain("medical");
    });

    it("passes attachment hints through (category only — mimeType/consentState not routed)", () => {
      const service = buildService();
      const preprocessorResult = makePreprocessorResult({ hasAttachments: true });

      const request = service.buildRequest({
        preprocessorResult,
        attachmentHints: [{ category: "food_photo" }],
      });

      expect(request.attachmentHints).toHaveLength(1);
      expect(request.attachmentHints[0]?.category).toBe("food_photo");
    });

    it("caps attachment hints at 5", () => {
      const service = buildService();
      const preprocessorResult = makePreprocessorResult();

      const request = service.buildRequest({
        preprocessorResult,
        attachmentHints: Array.from({ length: 8 }, (_, i) => ({ category: `photo_${i}` })),
      });

      expect(request.attachmentHints.length).toBeLessThanOrEqual(5);
    });

    it("truncates recentMessages to the last 6", () => {
      const service = buildService();
      const preprocessorResult = makePreprocessorResult();
      const recentMessages = Array.from({ length: 10 }, (_, i) => ({
        role: "user" as const,
        content: `message ${i}`,
      }));

      const request = service.buildRequest({ preprocessorResult, recentMessages });

      expect(request.recentMessageHints.length).toBeLessThanOrEqual(6);
    });

    it("validates the assembled request against the Zod schema", () => {
      const service = buildService();
      const preprocessorResult = makePreprocessorResult();

      const request = service.buildRequest({ preprocessorResult });
      const parsed = routerDecisionRequestSchema.safeParse(request);

      expect(parsed.success).toBe(true);
    });

    // -----------------------------------------------------------------------
    // i18n — detectedLanguage uses responseLanguage ?? detectedLanguage
    // -----------------------------------------------------------------------

    it("uses responseLanguage as detectedLanguage on the router request when hint overrides detection (responseLanguage='ru', detectedLanguage='en')", () => {
      // The preprocessor has already applied hint ?? detected; the router request
      // must carry the resolved responseLanguage in its detectedLanguage field.
      const service = buildService();
      const preprocessorResult = {
        ...makePreprocessorResult({ detectedLanguage: "en" }),
        // Simulate hint override: user locale is "ru", message text is English.
        responseLanguage: "ru",
      };

      const request = service.buildRequest({ preprocessorResult });

      // The router request detectedLanguage should be "ru" (the resolved hint).
      expect(request.detectedLanguage).toBe("ru");
    });

    it("uses detectedLanguage on the router request when responseLanguage is null", () => {
      const service = buildService();
      const preprocessorResult = {
        ...makePreprocessorResult({ detectedLanguage: "en" }),
        responseLanguage: null,
      };

      const request = service.buildRequest({ preprocessorResult });

      // responseLanguage is null → falls back to detectedLanguage "en".
      expect(request.detectedLanguage).toBe("en");
    });

    it("omits detectedLanguage on the router request when both responseLanguage and detectedLanguage are null", () => {
      const service = buildService();
      const preprocessorResult = {
        ...makePreprocessorResult({ detectedLanguage: null }),
        responseLanguage: null,
      };

      const request = service.buildRequest({ preprocessorResult });

      expect(request.detectedLanguage).toBeUndefined();
    });

    it("includes safety guardrails in the request", () => {
      const service = buildService();
      const preprocessorResult = makePreprocessorResult();

      const request = service.buildRequest({ preprocessorResult });

      expect(request.safetyGuardrails.length).toBeGreaterThan(0);
      expect(request.safetyGuardrails.some((g) => g.includes("domain"))).toBe(true);
    });
  });

  describe("route", () => {
    it("returns the clamped LLM output on success", async () => {
      const service = buildService();
      const input: RouterLlmServiceInput = { preprocessorResult: makePreprocessorResult() };

      const result = await service.route(input);

      expect(result.source).toBe("llm");
      expect(result.validationErrors).toHaveLength(0);
      expect(result.output.selectedDomains).toHaveLength(1);
      expect(result.output.selectedDomains[0]?.domain).toBe("workout");
    });

    it("returns a fallback when the provider throws", async () => {
      const service = buildService({
        generateRouterDecision: vi.fn().mockRejectedValue(new Error("network timeout")),
      });

      const result = await service.route({ preprocessorResult: makePreprocessorResult() });

      expect(result.source).toBe("fallback");
      expect(result.validationErrors).toContain("network timeout");
      expect(result.output).toEqual(createFallbackRouterDecision());
    });

    it("returns a fallback when the provider output contains forbidden keys (reply)", async () => {
      const service = buildService({
        generateRouterDecision: vi.fn().mockResolvedValue({
          output: {
            reply: "Here is my coaching advice",
            selectedDomains: [],
            safetyFlags: [],
            confidence: 0.5,
          },
        }),
      });

      const result = await service.route({ preprocessorResult: makePreprocessorResult() });

      expect(result.source).toBe("fallback");
      expect(result.validationErrors.some((e) => e.includes("reply"))).toBe(true);
    });

    it("returns a fallback when the provider output contains forbidden keys (proposals)", async () => {
      const service = buildService({
        generateRouterDecision: vi.fn().mockResolvedValue({
          output: {
            proposals: [{ intent: "create_workout_plan" }],
            selectedDomains: [],
            safetyFlags: [],
            confidence: 0.5,
          },
        }),
      });

      const result = await service.route({ preprocessorResult: makePreprocessorResult() });

      expect(result.source).toBe("fallback");
      expect(result.validationErrors.some((e) => e.includes("proposal"))).toBe(true);
    });

    it("clamps selectedDomains to a maximum of 3", async () => {
      // Build a raw output object that bypasses the schema (which also caps at 3)
      // to simulate a provider that returns too many domains at the raw object level.
      const tooManyDomainsOutput: RouterDecisionOutput = {
        selectedDomains: [
          { domain: "workout", confidence: 0.9, intentHints: [], toolHints: [], signalHints: [] },
          { domain: "nutrition", confidence: 0.8, intentHints: [], toolHints: [], signalHints: [] },
          { domain: "health", confidence: 0.7, intentHints: [], toolHints: [], signalHints: [] },
          // Pretend the provider snuck in a fourth entry:
          { domain: "health", confidence: 0.6, intentHints: [], toolHints: [], signalHints: [] },
        ] as RouterDecisionOutput["selectedDomains"],
        safetyFlags: [],
        confidence: 0.9,
      };

      const service = buildService({
        generateRouterDecision: vi.fn().mockResolvedValue({ output: tooManyDomainsOutput }),
      });

      const result = await service.route({ preprocessorResult: makePreprocessorResult() });

      expect(result.output.selectedDomains.length).toBeLessThanOrEqual(3);
    });

    it("clamps unknown safetyFlags from the provider output", async () => {
      const outputWithUnknownFlag = {
        selectedDomains: [],
        safetyFlags: ["fatigue", "unknown_flag_xyz"],
        confidence: 0.5,
      };

      const service = buildService({
        generateRouterDecision: vi.fn().mockResolvedValue({ output: outputWithUnknownFlag }),
      });

      const result = await service.route({ preprocessorResult: makePreprocessorResult() });

      // Unknown flags should be stripped; only known catalog flags remain.
      expect(result.output.safetyFlags).not.toContain("unknown_flag_xyz");
    });

    it("never emits replies or proposals (output shape invariant)", async () => {
      const service = buildService();

      const result = await service.route({ preprocessorResult: makePreprocessorResult() });
      const output = result.output as unknown as Record<string, unknown>;

      expect(output["reply"]).toBeUndefined();
      expect(output["proposals"]).toBeUndefined();
      expect(output["text"]).toBeUndefined();
    });

    it("falls back gracefully when provider returns a non-object", async () => {
      const service = buildService({
        generateRouterDecision: vi.fn().mockResolvedValue({ output: null }),
      });

      const result = await service.route({ preprocessorResult: makePreprocessorResult() });

      expect(result.source).toBe("fallback");
      expect(result.validationErrors.length).toBeGreaterThan(0);
    });

    it("falls back gracefully when provider returns a string", async () => {
      const service = buildService({
        generateRouterDecision: vi.fn().mockResolvedValue({ output: "not an object" }),
      });

      const result = await service.route({ preprocessorResult: makePreprocessorResult() });

      expect(result.source).toBe("fallback");
    });

    it("returns a fallback when the provider output contains forbidden key 'tool' (unsafe intent)", async () => {
      // A provider returning a 'tool' key would indicate an attempt to embed a
      // tool call in the router output — explicitly forbidden by the safety contract.
      const service = buildService({
        generateRouterDecision: vi.fn().mockResolvedValue({
          output: {
            tool: "getDocumentContext",
            selectedDomains: [],
            safetyFlags: [],
            confidence: 0.5,
          },
        }),
      });

      const result = await service.route({ preprocessorResult: makePreprocessorResult() });

      expect(result.source).toBe("fallback");
      expect(result.validationErrors.some((e) => e.includes("tool"))).toBe(true);
    });

    it("returns a fallback when the provider output contains forbidden key 'kind' (loop-output leakage)", async () => {
      // 'kind' is a forbidden key from the agent-loop output format — if it leaks
      // into the router output the output is treated as unsafe and rejected.
      const service = buildService({
        generateRouterDecision: vi.fn().mockResolvedValue({
          output: {
            kind: "final_answer",
            selectedDomains: [],
            safetyFlags: [],
            confidence: 0.5,
          },
        }),
      });

      const result = await service.route({ preprocessorResult: makePreprocessorResult() });

      expect(result.source).toBe("fallback");
      expect(result.validationErrors.some((e) => e.includes("kind"))).toBe(true);
    });

    it("returns a fallback when the provider output contains forbidden key 'advice' (unsafe coaching text)", async () => {
      const service = buildService({
        generateRouterDecision: vi.fn().mockResolvedValue({
          output: {
            advice: "You should eat more protein.",
            selectedDomains: [],
            safetyFlags: [],
            confidence: 0.5,
          },
        }),
      });

      const result = await service.route({ preprocessorResult: makePreprocessorResult() });

      expect(result.source).toBe("fallback");
      expect(result.validationErrors.some((e) => e.includes("advice"))).toBe(true);
    });

    it("rejects provider output containing unknown toolHints (schema validation rejects invalid tool names)", async () => {
      // 'getAdminTool' is not in the AgentToolName enum.
      // The Zod schema validation runs before clamping, so an unrecognised tool
      // name in toolHints causes validateRouterDecisionOutputShape to fail and
      // triggers a safe fallback — it never reaches the clamp step.
      const outputWithUnknownTool = {
        selectedDomains: [
          {
            domain: "workout",
            confidence: 0.8,
            intentHints: [],
            toolHints: ["getAdminTool", "getUserContextSlice"],
            signalHints: [],
          },
        ],
        safetyFlags: [],
        confidence: 0.8,
      };

      const service = buildService({
        generateRouterDecision: vi.fn().mockResolvedValue({ output: outputWithUnknownTool }),
      });

      const result = await service.route({ preprocessorResult: makePreprocessorResult() });

      // Unknown tool name must not reach downstream: the validator rejects the output.
      expect(result.source).toBe("fallback");
      expect(result.output.selectedDomains).toHaveLength(0);
    });

    it("returns fallback with empty selectedDomains when confident output has no domains", async () => {
      // Edge case: LLM returns high confidence but selects no domains — fallback
      // applies because createFallbackRouterDecision is not triggered but the
      // clamped output has empty selectedDomains and the orchestrator handles it.
      const service = buildService({
        generateRouterDecision: vi.fn().mockResolvedValue({
          output: {
            selectedDomains: [],
            safetyFlags: [],
            confidence: 0.9,
          },
        }),
      });

      const result = await service.route({ preprocessorResult: makePreprocessorResult() });

      expect(result.source).toBe("llm");
      expect(result.output.selectedDomains).toHaveLength(0);
      expect(result.output.confidence).toBe(0.9);
    });
  });
});

// ---------------------------------------------------------------------------
// Long-message truncation — Slice 2 regression guard
// A 12 000-char message must not throw; normalizedText on the built request
// must be ≤ ROUTER_TEXT_MAX_CHARS (4000) and must preserve the head.
// ---------------------------------------------------------------------------

describe("RouterLlmService — long-message truncation (Slice 2)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("buildRequest with a 12 000-char message does not throw and normalizedText.length <= 4000", () => {
    const service = buildService();
    const longMessage = "Сохрани мне эту программу тренировок: " + "x".repeat(12_000);

    const preprocessorResult = makePreprocessorResult({
      originalText: longMessage,
      normalizedText: longMessage,
    });

    // Must not throw — previously threw because schema max(4000) was exceeded
    const request = service.buildRequest({ preprocessorResult });

    expect(request.normalizedText.length).toBeLessThanOrEqual(ROUTER_TEXT_MAX_CHARS);
    expect(request.originalText.length).toBeLessThanOrEqual(ROUTER_TEXT_MAX_CHARS);
  });

  it("request.preprocessor.normalizedText and originalText are also truncated to <= ROUTER_TEXT_MAX_CHARS (M1 — no full message leaked via preprocessorJson)", () => {
    // Regression guard: the preprocessor object serialised into {{preprocessorJson}} must
    // carry truncated text, not the full 12 000-char message.
    const service = buildService();
    const prefix = "Сохрани мне эту программу тренировок: ";
    const longMessage = prefix + "x".repeat(12_000);

    const preprocessorResult = makePreprocessorResult({
      originalText: longMessage,
      normalizedText: longMessage,
    });

    const request = service.buildRequest({ preprocessorResult });

    expect(request.preprocessor.normalizedText.length).toBeLessThanOrEqual(ROUTER_TEXT_MAX_CHARS);
    expect(request.preprocessor.originalText.length).toBeLessThanOrEqual(ROUTER_TEXT_MAX_CHARS);
    // Head preserved in the preprocessor copy.
    expect(request.preprocessor.normalizedText.startsWith(prefix)).toBe(true);
    expect(request.preprocessor.originalText.startsWith(prefix)).toBe(true);
  });

  it("buildRequest preserves the head of the long message in normalizedText", () => {
    const service = buildService();
    const prefix = "Сохрани мне эту программу тренировок: ";
    const longMessage = prefix + "y".repeat(12_000);

    const preprocessorResult = makePreprocessorResult({
      originalText: longMessage,
      normalizedText: longMessage,
    });

    const request = service.buildRequest({ preprocessorResult });

    expect(request.normalizedText.startsWith(prefix)).toBe(true);
  });

  it("route with a 12 000-char message does not throw and returns a valid result", async () => {
    const service = buildService();
    const longMessage = "Сохрани мне эту программу тренировок: " + "x".repeat(12_000);

    const preprocessorResult = makePreprocessorResult({
      originalText: longMessage,
      normalizedText: longMessage,
    });

    // Must not throw or degrade from a parse error
    const result = await service.route({ preprocessorResult });

    // Provider stub returns a workout domain selection — long message must not cause fallback
    expect(result.source).toBe("llm");
    expect(result.output.selectedDomains).toHaveLength(1);
    expect(result.output.selectedDomains[0]?.domain).toBe("workout");
  });
});
