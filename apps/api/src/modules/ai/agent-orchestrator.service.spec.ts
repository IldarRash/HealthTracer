import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentContextPacket } from "@health/types";
import { AgentOrchestratorService } from "./agent-orchestrator.service.js";
import * as coachProviderFactory from "./coach-provider.factory.js";
import {
  buildAgentPromptContextFromPacket,
  LEGACY_BROAD_COACHING_CONTEXT_KEYS,
} from "../coaching-context/agent-prompt-context.js";

const SAFE_FALLBACK_REPLY =
  "I could not safely process that response. Please try again with a wellness-focused question.";

const LEGACY_LEAK_FIELDS = [
  "documentContext",
  "documentSignalContext",
  "correlationInsights",
  ...LEGACY_BROAD_COACHING_CONTEXT_KEYS,
] as const;

function createSlicePacket(
  purpose: AgentContextPacket["purpose"],
  intent: AgentContextPacket["intent"],
  sliceExtras: Record<string, unknown> = {},
): AgentContextPacket {
  const depth =
    purpose === "general_chat"
      ? "small"
      : purpose === "health_context"
        ? "large"
        : "medium";
  const timeRange =
    purpose === "general_chat" ? "7d" : purpose === "health_context" ? "30d" : "14d";

  return {
    purpose,
    depth,
    timeRange,
    intent,
    generatedAt: new Date().toISOString(),
    safetyConstraints: ["Do not diagnose medical conditions."],
    sourceRefs:
      purpose === "health_context"
        ? [
            {
              domain: "document",
              label: "Blood panel",
              referenceId: "d1000001-0000-4000-8000-000000000001",
            },
            {
              domain: "rag",
              label: "Blood panel snippet",
              referenceId: "d1000001-0000-4000-8000-000000000001",
            },
          ]
        : [{ domain: "profile", label: "User profile summary" }],
    slice: {
      purpose,
      depth,
      timeRange,
      generatedAt: new Date().toISOString(),
      relevantMemories: [],
      snapshots: [],
      recommendationConstraints: [],
      sourceRefs: [],
      ...sliceExtras,
    },
  };
}

function createOrchestratorWithCapturedProvider(contextPacket: AgentContextPacket) {
  const generateCoachResponse = vi.fn().mockResolvedValue({
    reply: "Here is a wellness-focused response you can review.",
    proposals: [],
  });

  const coachingContextService = {
    buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
    toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
      buildAgentPromptContextFromPacket(packet),
    ),
  };

  const agentToolRegistryService = {
    executeTool: vi.fn().mockResolvedValue({ tool: "getWeeklyProgressContext", ok: true, result: null }),
  };

  const service = new AgentOrchestratorService(
    coachingContextService as never,
    agentToolRegistryService as never,
  );

  Object.assign(service, { provider: { generateCoachResponse } });

  return { service, generateCoachResponse, coachingContextService };
}

function expectProviderContextExcludesLegacyFields(context: Record<string, unknown>) {
  for (const key of LEGACY_LEAK_FIELDS) {
    expect(context).not.toHaveProperty(key);
  }
}

describe("AgentOrchestratorService provider context minimization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["general chat", "How can I stay consistent this week?", "general_chat", "general"],
    ["workout adaptation", "Can you adapt my workout plan this week?", "workout_adaptation", "adjust_workout"],
    [
      "nutrition adaptation",
      "Can you adjust my nutrition plan for more protein?",
      "nutrition_adaptation",
      "adjust_nutrition",
    ],
  ] as const)(
    "excludes document and legacy broad context for %s",
    async (_label, userMessage, purpose, intent) => {
      const contextPacket = createSlicePacket(purpose, intent, {
        activeWorkoutPlan:
          purpose === "workout_adaptation"
            ? { title: "Plan", summary: "Summary", sessionCount: 3 }
            : undefined,
        activeNutritionPlan:
          purpose === "nutrition_adaptation"
            ? {
                title: "Macros",
                summary: "Higher protein focus.",
                caloriesPerDay: 2200,
                proteinGrams: 160,
                carbsGrams: 200,
                fatGrams: 70,
                hydrationLiters: 2.5,
                preferences: [],
                restrictions: [],
              }
            : undefined,
      });

      const { service, generateCoachResponse, coachingContextService } =
        createOrchestratorWithCapturedProvider(contextPacket);

      await service.orchestrateCoachTurn({
        auth: {
          clerkUserId: "clerk-user",
          email: "test@example.com",
          displayName: "Test",
        },
        userMessage,
        recentMessages: [],
      });

      expect(coachingContextService.buildAgentContext).toHaveBeenCalledTimes(1);
      expect(coachingContextService.toAgentPromptContext).toHaveBeenCalledWith(contextPacket);
      const providerRequest = generateCoachResponse.mock.calls[0]?.[0] as {
        coachingContext: Record<string, unknown>;
      };

      expectProviderContextExcludesLegacyFields(providerRequest.coachingContext);
      expect(providerRequest.coachingContext.agentContext).toMatchObject({
        purpose,
        intent,
      });
    },
  );

  it("includes consent-gated document context for health_context turns", async () => {
    const contextPacket = createSlicePacket("health_context", "ask_health_context", {
      documentContext: {
        items: [
          {
            documentId: "d1000001-0000-4000-8000-000000000001",
            summaryId: "a1000001-0000-4000-8000-000000000001",
            documentType: "lab_report",
            title: "Blood panel",
            summarySnippet: "Approved summary only.",
            extractedConstraints: [],
          },
        ],
        generatedAt: new Date().toISOString(),
      },
      ragResults: [
        {
          documentId: "d1000001-0000-4000-8000-000000000001",
          summaryId: "a1000001-0000-4000-8000-000000000001",
          title: "Blood panel",
          snippet: "Approved summary only.",
          provenance: "approved_document_summary",
          consentScope: "semantic_indexing",
        },
      ],
    });

    const { service, generateCoachResponse } =
      createOrchestratorWithCapturedProvider(contextPacket);

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Please consider my lab results and medical background.",
      recentMessages: [],
    });

    const providerRequest = generateCoachResponse.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
    };

    expect(providerRequest.coachingContext.documentContext).toBeDefined();
    expect(providerRequest.coachingContext.ragResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provenance: "approved_document_summary",
        }),
      ]),
    );
    expect(result.agentMetadata.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceType: "document_summary", label: "Blood panel" }),
        expect.objectContaining({
          sourceType: "document_summary",
          label: "Blood panel snippet",
        }),
      ]),
    );
    expect(
      result.agentMetadata.citations.some((citation) => citation.sourceType === "structured_state"),
    ).toBe(false);
  });
});

describe("AgentOrchestratorService", () => {
  it("orchestrates a stub coach turn with typed agent metadata", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service } = createOrchestratorWithCapturedProvider(contextPacket);

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    expect(result.output.reply.length).toBeGreaterThan(0);
    expect(result.agentMetadata.provider).toBe("stub");
    expect(result.agentMetadata.purpose).toBe("workout_adaptation");
    expect(result.agentMetadata.safety.status).toBe("passed");
  });
});

describe("AgentOrchestratorService provider failures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns provider_error safety status and a safe fallback when the provider throws", async () => {
    vi.spyOn(coachProviderFactory, "resolveAiCoachProviderMode").mockReturnValue("openai");

    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service } = createOrchestratorWithCapturedProvider(contextPacket);

    Object.assign(service, {
      provider: {
        generateCoachResponse: vi
          .fn()
          .mockRejectedValue(new Error("OpenAI coach provider request failed.")),
      },
    });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    expect(result.output.reply).toBe(SAFE_FALLBACK_REPLY);
    expect(result.output.proposals).toEqual([]);
    expect(result.agentMetadata.provider).toBe("openai");
    expect(result.agentMetadata.safety.status).toBe("provider_error");
    expect(result.agentMetadata.safety.blockedReasons).toContain(
      "OpenAI coach provider request failed.",
    );
    expect(result.parseErrors).toContain("OpenAI coach provider request failed.");
  });
});
