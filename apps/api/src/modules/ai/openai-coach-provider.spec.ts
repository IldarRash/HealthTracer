import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOpenAiCoachProvider,
  OpenAiCoachProviderMissingKeyError,
} from "./openai-coach-provider.js";

// ---------------------------------------------------------------------------
// Shared helper — mock fetch with a JSON response body
// ---------------------------------------------------------------------------

function mockFetch(responseBody: unknown) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify(responseBody),
          },
        },
      ],
    }),
  } as Response);
}

function mockFetchHttpError(status: number, message: string) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ error: { message } }),
  } as Response);
}

// ---------------------------------------------------------------------------
// Base request fixtures
// ---------------------------------------------------------------------------

const baseRouterRequest = {
  originalText: "Adjust my workout this week",
  normalizedText: "adjust my workout this week",
  preprocessor: {
    originalText: "Adjust my workout this week",
    normalizedText: "adjust my workout this week",
    detectedLanguage: "en",
    responseLanguage: "en",
    hasAttachments: false,
    mentionedDates: [],
    simpleSignals: {
      workout: true,
      nutrition: false,
      today: false,
      sleep: false,
      fatigue: false,
      pain: false,
      document: false,
      attachment: false,
    },
    directPathCandidate: null,
  },
  attachmentHints: [] as Array<{ category: string }>,
  recentMessageHints: [] as Array<{ role: "user" | "assistant" | "system"; content: string }>,
  availableDomains: [] as Array<{ domain: "workout" | "nutrition" | "health"; capabilityIds: string[]; intentSummaries: string[] }>,
  safetyGuardrails: [] as string[],
};

const baseDomainStepRequest = {
  domain: "workout" as const,
  iteration: 0,
  maxIterations: 3,
  priorToolResults: [] as Array<{ tool: "getUserContextSlice" | "getDocumentContext" | "getWeeklyProgressContext"; ok: boolean; errors: string[]; result?: unknown }>,
  userMessage: "Can you reduce my workout load?",
  recentMessages: [] as Array<{ role: "user" | "assistant" | "system"; content: string }>,
  coachingContext: {} as Record<string, unknown>,
  allowedTools: [] as Array<"getUserContextSlice" | "getDocumentContext" | "getWeeklyProgressContext">,
  allowedProposalIntents: ["adapt_workout_plan"],
  safetyFlags: [] as Array<"fatigue" | "pain" | "sleep_issue" | "stress" | "hunger" | "schedule_conflict" | "health_context">,
  safetyConstraints: ["Do not diagnose or prescribe."],
};

const baseFinalDecisionRequest = {
  userMessage: "Adjust my workout load this week",
  domainOutputs: [
    {
      kind: "domain_answer" as const,
      domain: "workout" as const,
      summary: "Candidate workout plan prepared.",
      candidateProposals: [
        {
          intent: "adapt_workout_plan",
          targetDomain: "workout",
          title: "Reduce load",
          reason: "Recovery week.",
          proposedChanges: {},
        },
      ],
      domainSignals: ["workout_plan_present"],
      workoutCalorieEstimate: 280,
    },
  ],
  actionVariantCatalog: [] as Array<{ id: string; label: string; requiresConsent: boolean }>,
  safetyFlags: [] as Array<"fatigue" | "pain" | "sleep_issue" | "stress" | "hunger" | "schedule_conflict" | "health_context">,
  safetyConstraints: ["Do not diagnose or prescribe."],
};

describe("OpenAiCoachProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Existing tests (preserved)
  // -------------------------------------------------------------------------

  it("throws a clear error when the API key is missing", () => {
    expect(() => createOpenAiCoachProvider(undefined, "gpt-4o-mini")).toThrow(
      OpenAiCoachProviderMissingKeyError,
    );
    expect(() => createOpenAiCoachProvider("   ", "gpt-4o-mini")).toThrow(
      /OPENAI_API_KEY is not configured/,
    );
  });

  it("keeps a valid reply and drops invalid proposals instead of failing the turn", async () => {
    mockFetch({
      kind: "final_answer",
      reply: "Вот безопасный план питания как обычный ответ.",
      proposals: [
        {
          intent: "made_up_nutrition_intent",
          targetDomain: "nutrition",
          title: "Invalid",
          reason: "Invalid",
          proposedChanges: {},
        },
      ],
    });

    const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
    const output = await provider.generateCoachResponse({
      userMessage: "подбери мне план питания",
      recentMessages: [],
      coachingContext: {},
      agentMetadata: {
        purpose: "nutrition_adaptation",
        intent: "adjust_nutrition",
        depth: "medium",
        timeRange: "14d",
        safetyConstraints: ["Do not diagnose."],
      },
    });

    expect(output).toEqual({
      reply: "Вот безопасный план питания как обычный ответ.",
      proposals: [],
    });
  });

  it("returns user-facing coaching text only from generateCoachResponse", async () => {
    mockFetch({
      kind: "final_answer",
      reply: "I recommend a lighter recovery session you can review first.",
      proposals: [],
    });

    const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
    const output = await provider.generateCoachResponse({
      userMessage: "Should I train today?",
      recentMessages: [],
      coachingContext: {},
      agentMetadata: {
        purpose: "workout_adaptation",
        intent: "adjust_workout",
        depth: "medium",
        timeRange: "14d",
        safetyConstraints: ["Do not diagnose."],
      },
    });

    expect(output.reply).toContain("recovery session");
    expect(output.proposals).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Phase 2: generateRouterDecision
  // -------------------------------------------------------------------------

  describe("generateRouterDecision", () => {
    it("returns parsed RouterDecisionOutput when provider returns valid JSON", async () => {
      const validResponse = {
        selectedDomains: [
          {
            domain: "workout",
            confidence: 0.85,
            intentHints: ["adjust_workout"],
            toolHints: [],
            signalHints: ["request_change"],
          },
        ],
        contextNeeds: [],
        safetyFlags: [],
        confidence: 0.85,
      };
      mockFetch(validResponse);

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      const output = await provider.generateRouterDecision(baseRouterRequest);

      expect((output.selectedDomains ?? [])[0]?.domain).toBe("workout");
      expect(output.confidence).toBe(0.85);
    });

    it("falls back to empty RouterDecision when provider returns a forbidden-key field", async () => {
      // reply is a forbidden key in RouterDecisionOutput
      mockFetch({
        reply: "I suggest the workout domain",
        selectedDomains: [],
        confidence: 0.5,
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      const output = await provider.generateRouterDecision(baseRouterRequest);

      // Falls back to safe empty router decision
      expect(output.selectedDomains).toEqual([]);
      expect(output.confidence).toBe(0);
    });

    it("falls back to empty RouterDecision when provider returns a proposals field", async () => {
      mockFetch({
        proposals: [{ intent: "adapt_workout_plan" }],
        selectedDomains: [{ domain: "workout", confidence: 0.8, intentHints: [], toolHints: [], signalHints: [] }],
        confidence: 0.8,
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      const output = await provider.generateRouterDecision(baseRouterRequest);

      expect(output.selectedDomains).toEqual([]);
      expect(output.confidence).toBe(0);
    });

    it("falls back to empty RouterDecision when provider returns malformed JSON structure", async () => {
      mockFetch({
        wrong_key: "not a router output",
        confidence: "not a number",
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      const output = await provider.generateRouterDecision(baseRouterRequest);

      expect(output.selectedDomains).toEqual([]);
      expect(output.confidence).toBe(0);
    });

    it("clamps selectedDomains to valid domains only", async () => {
      mockFetch({
        selectedDomains: [
          { domain: "workout", confidence: 0.9, intentHints: [], toolHints: [], signalHints: [] },
          { domain: "nutrition", confidence: 0.8, intentHints: [], toolHints: [], signalHints: [] },
          { domain: "health", confidence: 0.7, intentHints: [], toolHints: [], signalHints: [] },
        ],
        contextNeeds: [],
        safetyFlags: [],
        confidence: 0.9,
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      const output = await provider.generateRouterDecision(baseRouterRequest);

      expect((output.selectedDomains ?? []).length).toBeLessThanOrEqual(3);
      // All selected domains must be valid
      for (const d of output.selectedDomains ?? []) {
        expect(["workout", "nutrition", "health"]).toContain(d.domain);
      }
    });

    it("throws when OpenAI API returns an HTTP error", async () => {
      mockFetchHttpError(401, "Unauthorized");

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");

      await expect(provider.generateRouterDecision(baseRouterRequest)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Phase 2: generateDomainStep
  // -------------------------------------------------------------------------

  describe("generateDomainStep", () => {
    it("returns parsed DomainLlmStepOutput for a valid tool_request response", async () => {
      mockFetch({
        kind: "tool_request",
        tool: "getUserContextSlice",
        input: { purpose: "workout_adaptation" },
        rationale: "Need workout context",
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      const output = await provider.generateDomainStep(baseDomainStepRequest);

      expect(output.kind).toBe("tool_request");
      if (output.kind === "tool_request") {
        expect(output.tool).toBe("getUserContextSlice");
      }
    });

    it("returns parsed DomainLlmStepOutput for a valid domain_answer response", async () => {
      mockFetch({
        kind: "domain_answer",
        domain: "workout",
        summary: "Workout context reviewed. Candidate plan prepared.",
        candidateProposals: [
          {
            intent: "adapt_workout_plan",
            targetDomain: "workout",
            title: "Reduce load",
            reason: "Recovery week.",
            proposedChanges: {},
          },
        ],
        domainSignals: ["workout_plan_present"],
        workoutCalorieEstimate: 300,
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      const output = await provider.generateDomainStep(baseDomainStepRequest);

      expect(output.kind).toBe("domain_answer");
      if (output.kind === "domain_answer") {
        expect(output.domain).toBe("workout");
        expect(output.workoutCalorieEstimate).toBe(300);
      }
    });

    it("throws when provider returns a forbidden reply field in domain step output", async () => {
      mockFetch({
        kind: "domain_answer",
        domain: "workout",
        summary: "Plan reviewed.",
        candidateProposals: [],
        domainSignals: [],
        reply: "Here is your plan!", // FORBIDDEN
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");

      await expect(
        provider.generateDomainStep(baseDomainStepRequest),
      ).rejects.toThrow(/invalid output/);
    });

    it("throws when provider returns workoutCalorieEstimate on nutrition domain", async () => {
      mockFetch({
        kind: "domain_answer",
        domain: "nutrition",
        summary: "Nutrition advice.",
        candidateProposals: [],
        domainSignals: [],
        workoutCalorieEstimate: 300, // FORBIDDEN on nutrition domain
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");

      await expect(
        provider.generateDomainStep({ ...baseDomainStepRequest, domain: "nutrition" }),
      ).rejects.toThrow(/invalid output/);
    });

    it("throws when provider returns malformed domain step (missing kind)", async () => {
      mockFetch({
        domain: "workout",
        summary: "Missing kind field",
        candidateProposals: [],
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");

      await expect(
        provider.generateDomainStep(baseDomainStepRequest),
      ).rejects.toThrow(/invalid output/);
    });

    it("throws when provider returns an invalid tool name", async () => {
      mockFetch({
        kind: "tool_request",
        tool: "dangerousUnknownTool",
        input: {},
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");

      await expect(
        provider.generateDomainStep(baseDomainStepRequest),
      ).rejects.toThrow();
    });

    it("throws when OpenAI API returns an HTTP error", async () => {
      mockFetchHttpError(500, "Internal server error");

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");

      await expect(
        provider.generateDomainStep(baseDomainStepRequest),
      ).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Phase 2: generateFinalDecision
  // -------------------------------------------------------------------------

  describe("generateFinalDecision", () => {
    it("returns parsed FinalDecisionOutput for a valid provider response", async () => {
      mockFetch({
        reply: "Here is your workout adjustment proposal. Review before anything changes.",
        selectedAction: "adapt_workout",
        proposals: [
          {
            intent: "adapt_workout_plan",
            targetDomain: "workout",
            title: "Reduce load",
            reason: "Recovery week.",
            proposedChanges: {},
          },
        ],
        consentRequired: false,
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      const output = await provider.generateFinalDecision(baseFinalDecisionRequest);

      expect(output.reply).toContain("workout adjustment");
      expect(output.selectedAction).toBe("adapt_workout");
      expect(Array.isArray(output.proposals)).toBe(true);
      expect(output.consentRequired).toBe(false);
    });

    it("consentRequired field is present in valid output", async () => {
      mockFetch({
        reply: "I noticed some health context. Do you consent to saving it?",
        selectedAction: null,
        proposals: [],
        consentRequired: true,
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      const output = await provider.generateFinalDecision(baseFinalDecisionRequest);

      expect(output.consentRequired).toBe(true);
    });

    it("falls back to safe FinalDecision when provider returns a forbidden 'kind' field", async () => {
      // 'kind' is a forbidden key in FinalDecisionOutput
      mockFetch({
        kind: "final_answer",
        reply: "Here is your plan.",
        proposals: [],
        consentRequired: false,
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      const output = await provider.generateFinalDecision(baseFinalDecisionRequest);

      // Should use safe fallback
      expect(typeof output.reply).toBe("string");
      expect(output.reply.length).toBeGreaterThan(0);
      expect(output.proposals).toEqual([]);
      expect(output.consentRequired).toBe(false);
    });

    it("falls back to safe FinalDecision when provider returns 'advice' forbidden field", async () => {
      mockFetch({
        reply: "Here is your plan.",
        advice: "You should train more",
        proposals: [],
        consentRequired: false,
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      const output = await provider.generateFinalDecision(baseFinalDecisionRequest);

      expect(typeof output.reply).toBe("string");
      expect(output.proposals).toEqual([]);
    });

    it("falls back to safe FinalDecision when provider returns 'domain' field", async () => {
      mockFetch({
        reply: "Your plan is ready.",
        domain: "workout",
        proposals: [],
        consentRequired: false,
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      const output = await provider.generateFinalDecision(baseFinalDecisionRequest);

      expect(typeof output.reply).toBe("string");
      expect(output.proposals).toEqual([]);
    });

    it("falls back to safe FinalDecision when reply is empty", async () => {
      mockFetch({
        reply: "",
        proposals: [],
        consentRequired: false,
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      const output = await provider.generateFinalDecision(baseFinalDecisionRequest);

      // Falls back to a non-empty safe reply
      expect(output.reply.length).toBeGreaterThan(0);
    });

    it("falls back to safe FinalDecision when JSON is malformed (missing reply)", async () => {
      mockFetch({
        selectedAction: null,
        proposals: [],
        consentRequired: false,
      });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      const output = await provider.generateFinalDecision(baseFinalDecisionRequest);

      expect(typeof output.reply).toBe("string");
      expect(output.reply.length).toBeGreaterThan(0);
    });

    it("fallback reply does not contain diagnosis or treatment language", async () => {
      mockFetch({ broken: true });

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      const output = await provider.generateFinalDecision(baseFinalDecisionRequest);

      const lower = output.reply.toLowerCase();
      expect(lower).not.toContain("diagnos");
      expect(lower).not.toContain("treat");
      expect(lower).not.toContain("prescri");
    });

    it("throws when OpenAI API returns an HTTP error", async () => {
      mockFetchHttpError(429, "Rate limit exceeded");

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");

      await expect(
        provider.generateFinalDecision(baseFinalDecisionRequest),
      ).rejects.toThrow(/Rate limit exceeded/);
    });
  });

  // -------------------------------------------------------------------------
  // Step 7b: generateDomainStep — multimodal path for food_photo / medical images
  // -------------------------------------------------------------------------

  describe("generateDomainStep — multimodal vision path (Step 7b)", () => {
    const baseDomainResponseNutrition = {
      kind: "domain_answer",
      domain: "nutrition",
      summary: "Food photo analyzed. Approximate nutrition estimates prepared.",
      candidateProposals: [
        {
          intent: "log_nutrition_incident",
          targetDomain: "nutrition",
          title: "Log meal from photo",
          reason: "Approximate calorie estimate from the food photo.",
          proposedChanges: {
            incidentDateTime: "2026-05-30T12:00:00.000Z",
            items: [{ name: "Meal from photo", quantity: "1 serving", calories: 500 }],
            estimatedCalories: 500,
            estimatedMacros: { proteinGrams: 30, carbsGrams: 50, fatGrams: 15 },
            confidence: "medium",
            provenance: { source: "vision_llm_estimate", providerId: "nutrition_domain_llm" },
            imageRefs: [{ id: "a1000001-0000-4000-8000-000000000001" }],
          },
        },
      ],
      domainSignals: ["food_photo_present"],
    };

    function makeFoodPhotoDomainRequest(domain: "workout" | "nutrition" | "health" = "nutrition") {
      return {
        ...baseDomainStepRequest,
        domain,
        userMessage: "Log this meal from the photo.",
        attachmentContext: {
          items: [
            {
              attachmentRefId: "a1000001-0000-4000-8000-000000000001",
              category: "food_photo",
              mimeType: "image/jpeg",
              consentState: "none" as const,
              storageRef: "local://attachments/meal.jpg",
              // imageDataUri is set by the caller (storage-reading layer) before reaching the provider.
              imageDataUri: "data:image/jpeg;base64,/9j/testbase64data",
            },
          ],
        },
      };
    }

    it("calls multimodal endpoint when imageDataUri is present in attachment context", async () => {
      mockFetch(baseDomainResponseNutrition);

      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      await provider.generateDomainStep(makeFoodPhotoDomainRequest("nutrition"));

      expect(fetchSpy).toHaveBeenCalledOnce();
      const fetchCall = fetchSpy.mock.calls[0];
      const body = JSON.parse(fetchCall?.[1]?.body as string) as {
        messages: Array<{ role: string; content: unknown }>;
      };
      // The last message (user turn) must have an array content with image_url part.
      const userMessage = body.messages.find((m) => m.role === "user");
      expect(userMessage).toBeDefined();
      expect(Array.isArray(userMessage?.content)).toBe(true);
      const contentArray = userMessage?.content as Array<{ type: string; image_url?: unknown }>;
      const hasImageUrl = contentArray.some((part) => part.type === "image_url");
      expect(hasImageUrl).toBe(true);
    });

    it("sends image with detail=low in the multimodal user message", async () => {
      mockFetch(baseDomainResponseNutrition);

      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      await provider.generateDomainStep(makeFoodPhotoDomainRequest("nutrition"));

      const fetchCall = fetchSpy.mock.calls[0];
      const body = JSON.parse(fetchCall?.[1]?.body as string) as {
        messages: Array<{ role: string; content: unknown }>;
      };
      const userMessage = body.messages.find((m) => m.role === "user");
      const contentArray = userMessage?.content as Array<{
        type: string;
        image_url?: { url: string; detail: string };
      }>;
      const imagePart = contentArray.find((part) => part.type === "image_url");
      expect(imagePart?.image_url?.detail).toBe("low");
      expect(imagePart?.image_url?.url).toBe("data:image/jpeg;base64,/9j/testbase64data");
    });

    it("calls standard text endpoint (non-multimodal) when no imageDataUri is present", async () => {
      mockFetch({
        kind: "domain_answer",
        domain: "nutrition",
        summary: "Nutrition reviewed.",
        candidateProposals: [],
        domainSignals: [],
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      // Request with attachment context but no imageDataUri (storage not loaded).
      await provider.generateDomainStep({
        ...baseDomainStepRequest,
        domain: "nutrition",
        attachmentContext: {
          items: [
            {
              attachmentRefId: "a1000002-0000-4000-8000-000000000001",
              category: "food_photo",
              mimeType: "image/jpeg",
              consentState: "none" as const,
              storageRef: null,
              // No imageDataUri — falls back to text-only path.
            },
          ],
        },
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const body = JSON.parse(fetchCall?.[1]?.body as string) as {
        messages: Array<{ role: string; content: unknown }>;
      };
      // Without imageDataUri, the user message content is a plain string, not an array.
      const userMessage = body.messages.find((m) => m.role === "user");
      expect(typeof userMessage?.content).toBe("string");
    });

    it("calls standard text endpoint when attachment has non-image MIME (PDF)", async () => {
      mockFetch({
        kind: "domain_answer",
        domain: "health",
        summary: "Health context noted.",
        candidateProposals: [],
        domainSignals: [],
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      // PDF attachment — vision endpoint does not handle PDFs.
      await provider.generateDomainStep({
        ...baseDomainStepRequest,
        domain: "health",
        attachmentContext: {
          items: [
            {
              attachmentRefId: "m1000001-0000-4000-8000-000000000001",
              category: "medical_document",
              mimeType: "application/pdf",
              consentState: "granted" as const,
              storageRef: "local://attachments/lab-report.pdf",
              imageDataUri: "data:application/pdf;base64,JVBERi0...", // PDF data URI — not a valid image
            },
          ],
        },
      });

      const fetchCall = fetchSpy.mock.calls[0];
      const body = JSON.parse(fetchCall?.[1]?.body as string) as {
        messages: Array<{ role: string; content: unknown }>;
      };
      const userMessage = body.messages.find((m) => m.role === "user");
      // PDF MIME is not image/* — the multimodal path is NOT taken.
      expect(typeof userMessage?.content).toBe("string");
    });

    it("returns a valid DomainLlmStepOutput from the multimodal path", async () => {
      mockFetch(baseDomainResponseNutrition);

      const provider = createOpenAiCoachProvider("test-key", "gpt-4o-mini");
      const output = await provider.generateDomainStep(makeFoodPhotoDomainRequest("nutrition"));

      expect(output.kind).toBe("domain_answer");
      if (output.kind === "domain_answer") {
        expect(output.domain).toBe("nutrition");
        const proposals = output.candidateProposals ?? [];
        expect(proposals.length).toBeGreaterThan(0);
        // workoutCalorieEstimate must not be present on nutrition domain.
        expect(output.workoutCalorieEstimate).toBeUndefined();
      }
    });
  });
});
