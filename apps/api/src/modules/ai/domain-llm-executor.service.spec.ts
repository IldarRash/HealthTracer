import { createFallbackDomainAnswer, DEFAULT_CONTEXT_BUDGET_POLICY } from "@health/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentContextPacket } from "@health/types";
import type { CoachAiProvider } from "@health/ai";
import { createCoachAiProviderMock } from "@health/ai/testing";
import type { ClerkAuthContext } from "../../auth.types.js";
import type { ChatAttachmentsService } from "../chat-attachments/chat-attachments.service.js";
import { AgentToolRegistryService } from "./agent-tool-registry.service.js";
import { DomainLlmExecutorService } from "./domain-llm-executor.service.js";
import type { DomainFanoutEntry } from "./system-planner.service.js";
import type { OrchestrateCoachTurnInput } from "./agent-orchestrator.service.js";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

function makeAuth(): ClerkAuthContext {
  return {
    clerkUserId: "clerk_test_001",
    email: "test@example.com",
    displayName: "Test User",
  };
}

function makeMinimalSlice(purpose: AgentContextPacket["purpose"]): AgentContextPacket["slice"] {
  return {
    purpose,
    depth: "medium",
    timeRange: "7d",
    generatedAt: new Date().toISOString(),
    relevantMemories: [],
    snapshots: [],
    recommendationConstraints: [],
    sourceRefs: [],
  } as unknown as AgentContextPacket["slice"];
}

function makeContextPacket(
  purpose: AgentContextPacket["purpose"] = "workout_adaptation",
  intent: AgentContextPacket["intent"] = "adjust_workout",
): AgentContextPacket {
  return {
    purpose,
    depth: "medium",
    timeRange: "7d",
    intent,
    generatedAt: new Date().toISOString(),
    safetyConstraints: ["No medical diagnosis language."],
    missingContextNotes: [],
    sourceRefs: [],
    supplementarySlices: [],
    slice: makeMinimalSlice(purpose),
  } as unknown as AgentContextPacket;
}

function makeDomainEntry(
  domain: "workout" | "nutrition" | "health",
  allowedTools: string[] = ["getUserContextSlice", "getWeeklyProgressContext"],
): DomainFanoutEntry {
  const capabilityId =
    domain === "workout"
      ? ("adjust_workout" as const)
      : domain === "nutrition"
        ? ("adjust_nutrition" as const)
        : ("ask_health_context" as const);

  const allowedProposalIntents =
    domain === "workout"
      ? (["adapt_workout_plan"] as const)
      : domain === "nutrition"
        ? (["create_nutrition_plan"] as const)
        : ([] as const);

  return {
    domain,
    capabilityId,
    allowedTools: allowedTools as DomainFanoutEntry["allowedTools"],
    allowedProposalIntents: allowedProposalIntents as unknown as DomainFanoutEntry["allowedProposalIntents"],
    contextBudget: DEFAULT_CONTEXT_BUDGET_POLICY,
    executorMode: "proposal_flow",
  };
}

function makeOrchestratorInput(
  overrides?: Partial<Pick<OrchestrateCoachTurnInput, "userMessage" | "attachmentTurn">>,
): OrchestrateCoachTurnInput {
  return {
    auth: makeAuth(),
    userMessage: overrides?.userMessage ?? "Adjust my workout",
    recentMessages: [{ role: "user" as const, content: "Hello" }],
    ...(overrides?.attachmentTurn !== undefined
      ? { attachmentTurn: overrides.attachmentTurn }
      : {}),
  } as OrchestrateCoachTurnInput;
}

function makeProvider(domainStepOutput: unknown): CoachAiProvider {
  return createCoachAiProviderMock({
    generateDomainStep: vi.fn().mockResolvedValue(domainStepOutput),
  });
}

function makeToolRegistry(): AgentToolRegistryService {
  const mockResult = {
    tool: "getUserContextSlice",
    ok: true,
    result: { purpose: "workout_adaptation", generatedAt: new Date().toISOString() },
  };

  return {
    executeTool: vi.fn().mockResolvedValue(mockResult),
    listAvailableTools: vi.fn().mockReturnValue([
      "getUserContextSlice",
      "getWeeklyProgressContext",
      "getDocumentContext",
    ]),
  } as unknown as AgentToolRegistryService;
}

/**
 * Stub ChatAttachmentsService that returns empty buffer by default.
 * Override readStoredContent per test for image-loading behaviour tests.
 */
function makeAttachmentsService(
  readStoredContentImpl: (storageKey: string) => Promise<Buffer> = () =>
    Promise.resolve(Buffer.alloc(0)),
): ChatAttachmentsService {
  return {
    readStoredContent: vi.fn().mockImplementation(readStoredContentImpl),
  } as unknown as ChatAttachmentsService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DomainLlmExecutorService", () => {
  let service: DomainLlmExecutorService;
  let toolRegistry: AgentToolRegistryService;

  beforeEach(() => {
    toolRegistry = makeToolRegistry();
    service = new DomainLlmExecutorService(toolRegistry, makeAttachmentsService());
  });

  // -------------------------------------------------------------------------
  // Happy path — domain_answer returned on first iteration
  // -------------------------------------------------------------------------

  it("returns a domain_answer when the provider resolves on the first iteration", async () => {
    const provider = makeProvider({
      kind: "domain_answer",
      domain: "workout",
      summary: "Reviewed workout context.",
      candidateProposals: [
        {
          intent: "adapt_workout_plan",
          targetDomain: "workout",
          title: "Reduce load",
          reason: "Keep consistency.",
          proposedChanges: {},
        },
      ],
      domainSignals: ["workout_plan_present"],
      workoutCalorieEstimate: 280,
    });

    const result = await service.runDomainLoop({
      domainEntry: makeDomainEntry("workout"),
      contextPacket: makeContextPacket(),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput(),
      provider,
    });

    expect(result.degraded).toBe(false);
    expect(result.domainAnswer.domain).toBe("workout");
    expect(result.domainAnswer.summary).toBe("Reviewed workout context.");
    expect(result.domainAnswer.candidateProposals).toHaveLength(1);
    expect(result.domainAnswer.workoutCalorieEstimate).toBe(280);
    expect(result.loopIterations).toBe(1);
    expect(result.degradedReasons).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Tool loop — tool_request followed by domain_answer
  // -------------------------------------------------------------------------

  it("executes an allowed tool and then returns a domain_answer on the next iteration", async () => {
    const generateDomainStep = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "tool_request",
        tool: "getUserContextSlice",
        input: { purpose: "workout_adaptation" },
      })
      .mockResolvedValueOnce({
        kind: "domain_answer",
        domain: "workout",
        summary: "Context loaded and reviewed.",
        candidateProposals: [],
        domainSignals: [],
      });

    const provider = { ...makeProvider(null), generateDomainStep } as unknown as CoachAiProvider;

    const result = await service.runDomainLoop({
      domainEntry: makeDomainEntry("workout"),
      contextPacket: makeContextPacket(),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput(),
      provider,
    });

    expect(result.degraded).toBe(false);
    expect(result.toolsInvoked).toContain("getUserContextSlice");
    expect(result.loopIterations).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Per-domain tool allowlist enforcement
  // -------------------------------------------------------------------------

  it("degrades when the domain LLM requests a tool not in the domain allowlist", async () => {
    // Workout domain only allows getUserContextSlice; provider requests getDocumentContext.
    const provider = makeProvider({
      kind: "tool_request",
      tool: "getDocumentContext",
      input: {},
    });

    const result = await service.runDomainLoop({
      domainEntry: makeDomainEntry("workout", ["getUserContextSlice"]),
      contextPacket: makeContextPacket(),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput(),
      provider,
    });

    expect(result.degraded).toBe(true);
    expect(result.degradedReasons.join(" ")).toContain("getDocumentContext");
    expect(result.degradedReasons.join(" ")).toContain("per-domain allowlist");
    // Tool registry must NOT have been called for the blocked tool.
    expect(toolRegistry.executeTool).not.toHaveBeenCalled();
  });

  it("health domain cannot use workout-only tools (getWeeklyProgressContext)", async () => {
    // Health domain (getUserContextSlice only); provider requests getWeeklyProgressContext.
    const provider = makeProvider({
      kind: "tool_request",
      tool: "getWeeklyProgressContext",
      input: {},
    });

    const result = await service.runDomainLoop({
      domainEntry: makeDomainEntry("health", ["getUserContextSlice"]),
      contextPacket: makeContextPacket("health_context", "ask_health_context"),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput({ userMessage: "How is my health?" }),
      provider,
    });

    expect(result.degraded).toBe(true);
    expect(result.degradedReasons.join(" ")).toContain("per-domain allowlist");
  });

  // -------------------------------------------------------------------------
  // Loop exhaustion — no domain_answer within max iterations
  // -------------------------------------------------------------------------

  it("degrades when the loop exhausts max iterations without a domain_answer", async () => {
    // Always returns tool_request so the loop never resolves.
    const provider = makeProvider({
      kind: "tool_request",
      tool: "getUserContextSlice",
      input: {},
    });

    const result = await service.runDomainLoop({
      domainEntry: makeDomainEntry("nutrition"),
      contextPacket: makeContextPacket("nutrition_adaptation", "adjust_nutrition"),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput({ userMessage: "What should I eat?" }),
      provider,
    });

    expect(result.degraded).toBe(true);
    expect(result.degradedReasons.join(" ")).toContain("exhausted");
    expect(result.loopIterations).toBe(3); // DOMAIN_MAX_LOOP_ITERATIONS
    // Fallback answer must have empty candidateProposals (no unvalidated proposals leak).
    expect(result.domainAnswer.candidateProposals).toHaveLength(0);
    expect(result.domainAnswer.domain).toBe("nutrition");
  });

  // -------------------------------------------------------------------------
  // Reply safety — blocked when domain answer summary contains unsafe language
  // -------------------------------------------------------------------------

  it("degrades when the domain answer summary contains unsafe medical language", async () => {
    const provider = makeProvider({
      kind: "domain_answer",
      domain: "health",
      summary: "Based on your symptoms, I diagnose you with fatigue disorder.",
      candidateProposals: [],
      domainSignals: [],
    });

    const result = await service.runDomainLoop({
      domainEntry: makeDomainEntry("health", ["getUserContextSlice"]),
      contextPacket: makeContextPacket("health_context", "ask_health_context"),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput({ userMessage: "I am tired" }),
      provider,
    });

    expect(result.degraded).toBe(true);
    expect(result.domainAnswer).toEqual(createFallbackDomainAnswer("health"));
    // No proposals leak on safety block.
    expect(result.domainAnswer.candidateProposals).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Provider error isolation — does not crash the turn
  // -------------------------------------------------------------------------

  it("degrades gracefully when the provider throws an error (never rejects)", async () => {
    const provider: CoachAiProvider = {
      generateDomainStep: vi.fn().mockRejectedValue(new Error("OpenAI API rate limit")),
      generateAgentLoopStep: vi.fn(),
      generateCoachResponse: vi.fn(),
      generateRouterDecision: vi.fn(),
      generateFinalDecision: vi.fn(),
    } as unknown as CoachAiProvider;

    // Must resolve, not reject — the turn is not crashed.
    const result = await service.runDomainLoop({
      domainEntry: makeDomainEntry("workout"),
      contextPacket: makeContextPacket(),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput(),
      provider,
    });

    expect(result.degraded).toBe(true);
    expect(result.degradedReasons.join(" ")).toContain("OpenAI API rate limit");
    expect(result.domainAnswer).toEqual(createFallbackDomainAnswer("workout"));
  });

  // -------------------------------------------------------------------------
  // Forbidden shape guard — provider output contains forbidden fields
  // -------------------------------------------------------------------------

  it("degrades when the provider output contains forbidden user-facing fields", async () => {
    const provider = makeProvider({
      kind: "domain_answer",
      domain: "workout",
      summary: "OK",
      candidateProposals: [],
      domainSignals: [],
      // Forbidden field: 'reply' is in DOMAIN_LLM_STEP_FORBIDDEN_KEYS
      reply: "Here is your workout!",
    });

    const result = await service.runDomainLoop({
      domainEntry: makeDomainEntry("workout"),
      contextPacket: makeContextPacket(),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput(),
      provider,
    });

    expect(result.degraded).toBe(true);
    expect(result.degradedReasons.join(" ")).toContain("forbidden field");
  });

  // -------------------------------------------------------------------------
  // Domain discriminator mismatch — workout executor receives a nutrition answer
  // -------------------------------------------------------------------------

  it("degrades when domain_answer domain field does not match the executor domain", async () => {
    // Executor is 'workout' but provider returns domain: "nutrition".
    const provider = makeProvider({
      kind: "domain_answer",
      domain: "nutrition",
      summary: "Adjust nutrition plan.",
      candidateProposals: [],
      domainSignals: [],
    });

    const result = await service.runDomainLoop({
      domainEntry: makeDomainEntry("workout"),
      contextPacket: makeContextPacket(),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput(),
      provider,
    });

    expect(result.degraded).toBe(true);
    expect(result.degradedReasons.join(" ")).toContain("nutrition");
    expect(result.degradedReasons.join(" ")).toContain("workout");
  });

  // -------------------------------------------------------------------------
  // Per-domain timeout — degrades to fallback without rejecting
  // -------------------------------------------------------------------------

  describe("per-domain timeout", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("degrades to fallback when the domain LLM does not respond before the timeout fires", async () => {
      vi.useFakeTimers();

      // Provider never resolves — simulates a hung LLM call.
      const hangingProvider: CoachAiProvider = {
        generateDomainStep: vi.fn().mockImplementation(
          () => new Promise<never>(() => undefined), // never resolves
        ),
        generateAgentLoopStep: vi.fn(),
        generateCoachResponse: vi.fn(),
        generateRouterDecision: vi.fn(),
        generateFinalDecision: vi.fn(),
      } as unknown as CoachAiProvider;

      const resultPromise = service.runDomainLoop({
        domainEntry: makeDomainEntry("workout"),
        contextPacket: makeContextPacket(),
        coachingContext: {},
        orchestratorInput: makeOrchestratorInput(),
        provider: hangingProvider,
      });

      // Advance timers past the 30 000 ms per-domain timeout.
      vi.advanceTimersByTime(31_000);

      const result = await resultPromise;

      // Must resolve (not reject) with a fallback.
      expect(result.degraded).toBe(true);
      expect(result.degradedReasons.join(" ")).toContain("timed out");
      // No proposals may leak from a timed-out domain.
      expect(result.domainAnswer.candidateProposals).toHaveLength(0);
      expect(result.domainAnswer.domain).toBe("workout");
    });

    it("timeout fallback never rejects — outer Promise.all is not poisoned", async () => {
      vi.useFakeTimers();

      const hangingProvider: CoachAiProvider = {
        generateDomainStep: vi.fn().mockImplementation(
          () => new Promise<never>(() => undefined),
        ),
        generateAgentLoopStep: vi.fn(),
        generateCoachResponse: vi.fn(),
        generateRouterDecision: vi.fn(),
        generateFinalDecision: vi.fn(),
      } as unknown as CoachAiProvider;

      // Run two concurrent domain loops (mirrors what the orchestrator does).
      const [workoutPromise, nutritionPromise] = [
        service.runDomainLoop({
          domainEntry: makeDomainEntry("workout"),
          contextPacket: makeContextPacket(),
          coachingContext: {},
          orchestratorInput: makeOrchestratorInput(),
          provider: hangingProvider,
        }),
        service.runDomainLoop({
          domainEntry: makeDomainEntry("nutrition"),
          contextPacket: makeContextPacket("nutrition_adaptation", "adjust_nutrition"),
          coachingContext: {},
          orchestratorInput: makeOrchestratorInput({ userMessage: "What should I eat?" }),
          provider: hangingProvider,
        }),
      ] as const;

      vi.advanceTimersByTime(31_000);

      // Promise.all over both — must resolve, never reject.
      const results = await Promise.all([workoutPromise, nutritionPromise]);

      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(result.degraded).toBe(true);
        expect(result.degradedReasons.join(" ")).toContain("timed out");
        expect(result.domainAnswer.candidateProposals).toHaveLength(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Fallback domain_answer is always a safe empty output
  // -------------------------------------------------------------------------

  it("fallback result always has empty candidateProposals regardless of failure mode", async () => {
    const provider: CoachAiProvider = {
      generateDomainStep: vi.fn().mockRejectedValue(new Error("network error")),
      generateAgentLoopStep: vi.fn(),
      generateCoachResponse: vi.fn(),
      generateRouterDecision: vi.fn(),
      generateFinalDecision: vi.fn(),
    } as unknown as CoachAiProvider;

    const result = await service.runDomainLoop({
      domainEntry: makeDomainEntry("nutrition"),
      contextPacket: makeContextPacket("nutrition_adaptation", "adjust_nutrition"),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput({ userMessage: "Adjust nutrition" }),
      provider,
    });

    expect(result.degraded).toBe(true);
    expect(result.domainAnswer.candidateProposals).toHaveLength(0);
    expect(result.domainAnswer.summary).toBe(""); // empty string per createFallbackDomainAnswer
  });
});

// ---------------------------------------------------------------------------
// Step 7b — attachment context threading tests
// ---------------------------------------------------------------------------

describe("DomainLlmExecutorService — attachment context (Step 7b)", () => {
  let service: DomainLlmExecutorService;
  let toolRegistry: AgentToolRegistryService;

  beforeEach(() => {
    toolRegistry = makeToolRegistry();
    service = new DomainLlmExecutorService(toolRegistry, makeAttachmentsService());
  });

  it("threads food_photo attachment context into the nutrition domain step request", async () => {
    const capturedRequest = vi.fn().mockResolvedValue({
      kind: "domain_answer",
      domain: "nutrition",
      summary: "Analyzed the food photo.",
      candidateProposals: [],
      domainSignals: ["food_photo_present"],
    });

    const provider: CoachAiProvider = {
      generateDomainStep: capturedRequest,
      generateAgentLoopStep: vi.fn(),
      generateCoachResponse: vi.fn(),
      generateRouterDecision: vi.fn(),
      generateFinalDecision: vi.fn(),
    } as unknown as CoachAiProvider;

    await service.runDomainLoop({
      domainEntry: makeDomainEntry("nutrition"),
      contextPacket: makeContextPacket("nutrition_adaptation", "adjust_nutrition"),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput({
        userMessage: "Log this meal from the photo.",
        attachmentTurn: {
          attachments: [
            {
              attachmentRefId: "a1000001-0000-4000-8000-000000000001",
              category: "food_photo",
              mimeType: "image/jpeg",
              consentState: "none",
              storageRef: "local://attachments/meal.jpg",
            },
          ],
        },
      }),
      provider,
    });

    expect(capturedRequest).toHaveBeenCalled();
    const stepRequest = capturedRequest.mock.calls[0]?.[0] as {
      attachmentContext?: { items: Array<{ category: string; attachmentRefId: string }> };
    };
    expect(stepRequest.attachmentContext).toBeDefined();
    expect(stepRequest.attachmentContext?.items).toHaveLength(1);
    expect(stepRequest.attachmentContext?.items[0]?.category).toBe("food_photo");
    expect(stepRequest.attachmentContext?.items[0]?.attachmentRefId).toBe(
      "a1000001-0000-4000-8000-000000000001",
    );
  });

  it("includes food_photo in the workout domain step request (no domain-to-category filter)", async () => {
    // Attachments are context-only: all attachments flow to every selected domain.
    // The domain LLM decides relevance based on its own prompt and allowlists.
    const capturedRequest = vi.fn().mockResolvedValue({
      kind: "domain_answer",
      domain: "workout",
      summary: "Workout reviewed.",
      candidateProposals: [],
      domainSignals: [],
    });

    const provider: CoachAiProvider = {
      generateDomainStep: capturedRequest,
      generateAgentLoopStep: vi.fn(),
      generateCoachResponse: vi.fn(),
      generateRouterDecision: vi.fn(),
      generateFinalDecision: vi.fn(),
    } as unknown as CoachAiProvider;

    await service.runDomainLoop({
      domainEntry: makeDomainEntry("workout"),
      contextPacket: makeContextPacket("workout_adaptation", "adjust_workout"),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput({
        userMessage: "Adjust my workout.",
        attachmentTurn: {
          attachments: [
            {
              attachmentRefId: "a1000001-0000-4000-8000-000000000002",
              category: "food_photo",
              mimeType: "image/jpeg",
              consentState: "none",
              storageRef: "local://attachments/meal.jpg",
            },
          ],
        },
      }),
      provider,
    });

    expect(capturedRequest).toHaveBeenCalled();
    const stepRequest = capturedRequest.mock.calls[0]?.[0] as {
      attachmentContext?: { items: Array<{ category: string }> };
    };
    // All attachments reach every domain — domain LLM decides relevance.
    expect(stepRequest.attachmentContext).toBeDefined();
    expect(stepRequest.attachmentContext?.items).toHaveLength(1);
    expect(stepRequest.attachmentContext?.items[0]?.category).toBe("food_photo");
  });

  it("includes image attachment regardless of consentState (consent gate removed for images)", async () => {
    // Per the locked architecture, the upfront-consent gate for images is removed.
    // Images flow to every selected domain; the domain LLM reads content directly.
    // The allowDocuments=false context-budget floor (for DB health_documents slices)
    // is still enforced upstream by CoachingContextService.
    const capturedRequest = vi.fn().mockResolvedValue({
      kind: "domain_answer",
      domain: "health",
      summary: "Context only.",
      candidateProposals: [],
      domainSignals: [],
    });

    const provider: CoachAiProvider = {
      generateDomainStep: capturedRequest,
      generateAgentLoopStep: vi.fn(),
      generateCoachResponse: vi.fn(),
      generateRouterDecision: vi.fn(),
      generateFinalDecision: vi.fn(),
    } as unknown as CoachAiProvider;

    await service.runDomainLoop({
      domainEntry: makeDomainEntry("health", ["getUserContextSlice"]),
      contextPacket: makeContextPacket("health_context", "ask_health_context"),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput({
        userMessage: "Review my health image.",
        attachmentTurn: {
          attachments: [
            {
              attachmentRefId: "m1000001-0000-4000-8000-000000000001",
              category: "medical_document",
              mimeType: "image/jpeg",
              consentState: "needs_consent",  // No consent — still included in context-only mode.
              storageRef: "local://attachments/scan.jpg",
            },
          ],
        },
      }),
      provider,
    });

    expect(capturedRequest).toHaveBeenCalled();
    const stepRequest = capturedRequest.mock.calls[0]?.[0] as {
      attachmentContext?: { items: Array<{ category: string; consentState: string }> };
    };
    // Attachment reaches the domain LLM regardless of consentState.
    expect(stepRequest.attachmentContext).toBeDefined();
    expect(stepRequest.attachmentContext?.items).toHaveLength(1);
    expect(stepRequest.attachmentContext?.items[0]?.category).toBe("medical_document");
    expect(stepRequest.attachmentContext?.items[0]?.consentState).toBe("needs_consent");
  });

  it("includes image attachment regardless of category or consentState in all domain steps", async () => {
    // All categories (including formerly-consent-gated medical_document) flow to all domains.
    const capturedRequest = vi.fn().mockResolvedValue({
      kind: "domain_answer",
      domain: "health",
      summary: "Reviewed the health document.",
      candidateProposals: [],
      domainSignals: [],
    });

    const provider: CoachAiProvider = {
      generateDomainStep: capturedRequest,
      generateAgentLoopStep: vi.fn(),
      generateCoachResponse: vi.fn(),
      generateRouterDecision: vi.fn(),
      generateFinalDecision: vi.fn(),
    } as unknown as CoachAiProvider;

    await service.runDomainLoop({
      domainEntry: makeDomainEntry("health", ["getUserContextSlice"]),
      contextPacket: makeContextPacket("health_context", "ask_health_context"),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput({
        userMessage: "Review my lab results.",
        attachmentTurn: {
          attachments: [
            {
              attachmentRefId: "m2000001-0000-4000-8000-000000000001",
              category: "medical_document",
              mimeType: "image/jpeg",
              consentState: "granted",
              storageRef: "local://attachments/lab-scan.jpg",
            },
          ],
        },
      }),
      provider,
    });

    expect(capturedRequest).toHaveBeenCalled();
    const stepRequest = capturedRequest.mock.calls[0]?.[0] as {
      attachmentContext?: { items: Array<{ category: string; consentState: string }> };
    };
    expect(stepRequest.attachmentContext).toBeDefined();
    expect(stepRequest.attachmentContext?.items).toHaveLength(1);
    expect(stepRequest.attachmentContext?.items[0]?.category).toBe("medical_document");
    expect(stepRequest.attachmentContext?.items[0]?.consentState).toBe("granted");
  });

  it("populates imageDataUri from storage for nutrition domain image attachments — regression guard for Finding 2", async () => {
    // This test verifies that DomainLlmExecutorService reads image bytes from
    // ChatAttachmentsService and sets imageDataUri on the attachment item before
    // calling the provider. Without this, the OpenAI vision endpoint never receives
    // the food photo (the bug reported in the Phase 7 review finding).
    const fakeImageBytes = Buffer.from("fake-jpeg-data");
    const attachmentsService = makeAttachmentsService(
      () => Promise.resolve(fakeImageBytes),
    );
    const serviceWithImages = new DomainLlmExecutorService(toolRegistry, attachmentsService);

    const capturedRequest = vi.fn().mockResolvedValue({
      kind: "domain_answer",
      domain: "nutrition",
      summary: "Analyzed the food photo.",
      candidateProposals: [],
      domainSignals: ["food_photo_present"],
    });

    const provider: CoachAiProvider = {
      generateDomainStep: capturedRequest,
      generateAgentLoopStep: vi.fn(),
      generateCoachResponse: vi.fn(),
      generateRouterDecision: vi.fn(),
      generateFinalDecision: vi.fn(),
    } as unknown as CoachAiProvider;

    await serviceWithImages.runDomainLoop({
      domainEntry: makeDomainEntry("nutrition"),
      contextPacket: makeContextPacket("nutrition_adaptation", "adjust_nutrition"),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput({
        userMessage: "Log this meal from the photo.",
        attachmentTurn: {
          attachments: [
            {
              attachmentRefId: "a1000001-0000-4000-8000-000000000001",
              category: "food_photo",
              mimeType: "image/jpeg",
              consentState: "none",
              storageRef: "local://attachments/meal.jpg",
            },
          ],
        },
      }),
      provider,
    });

    expect(capturedRequest).toHaveBeenCalled();
    const stepRequest = capturedRequest.mock.calls[0]?.[0] as {
      attachmentContext?: {
        items: Array<{ category: string; imageDataUri?: string }>;
      };
    };

    expect(stepRequest.attachmentContext).toBeDefined();
    expect(stepRequest.attachmentContext?.items).toHaveLength(1);

    // imageDataUri MUST be present — this is the core regression guard.
    // If this fails, the LLM never received the food photo.
    const item = stepRequest.attachmentContext?.items[0];
    expect(item?.imageDataUri).toBeDefined();
    expect(item?.imageDataUri).toMatch(/^data:image\/jpeg;base64,/);
    expect(item?.imageDataUri).toContain(Buffer.from("fake-jpeg-data").toString("base64"));
  });

  it("skips imageDataUri for workout domain (workout domain does not use vision content)", async () => {
    const fakeImageBytes = Buffer.from("fake-workout-image");
    const attachmentsService = makeAttachmentsService(
      () => Promise.resolve(fakeImageBytes),
    );
    const serviceWithImages = new DomainLlmExecutorService(toolRegistry, attachmentsService);

    const capturedRequest = vi.fn().mockResolvedValue({
      kind: "domain_answer",
      domain: "workout",
      summary: "Workout reviewed.",
      candidateProposals: [],
      domainSignals: [],
      workoutCalorieEstimate: 280,
    });

    const provider: CoachAiProvider = {
      generateDomainStep: capturedRequest,
      generateAgentLoopStep: vi.fn(),
      generateCoachResponse: vi.fn(),
      generateRouterDecision: vi.fn(),
      generateFinalDecision: vi.fn(),
    } as unknown as CoachAiProvider;

    await serviceWithImages.runDomainLoop({
      domainEntry: makeDomainEntry("workout"),
      contextPacket: makeContextPacket("workout_adaptation", "adjust_workout"),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput({
        userMessage: "Adjust my workout.",
        attachmentTurn: {
          attachments: [
            {
              attachmentRefId: "w1000001-0000-4000-8000-000000000001",
              category: "workout_attachment",
              mimeType: "image/jpeg",
              consentState: "none",
              storageRef: "local://attachments/workout.jpg",
            },
          ],
        },
      }),
      provider,
    });

    expect(capturedRequest).toHaveBeenCalled();
    const stepRequest = capturedRequest.mock.calls[0]?.[0] as {
      attachmentContext?: {
        items: Array<{ category: string; imageDataUri?: string }>;
      };
    };

    // workout_attachment IS included for the workout domain, but imageDataUri
    // must NOT be set — the workout domain does not use vision content.
    if (stepRequest.attachmentContext) {
      const item = stepRequest.attachmentContext.items[0];
      expect(item?.imageDataUri).toBeUndefined();
    }
    // readStoredContent should NOT have been called for the workout domain.
    const readMock = (attachmentsService.readStoredContent as ReturnType<typeof vi.fn>);
    expect(readMock).not.toHaveBeenCalled();
  });

  it("degrades gracefully when storage read fails — imageDataUri absent, turn not blocked", async () => {
    const attachmentsService = makeAttachmentsService(
      () => Promise.reject(new Error("Storage read error")),
    );
    const serviceWithFailingStorage = new DomainLlmExecutorService(toolRegistry, attachmentsService);

    const capturedRequest = vi.fn().mockResolvedValue({
      kind: "domain_answer",
      domain: "nutrition",
      summary: "Nutrition reviewed (no photo).",
      candidateProposals: [],
      domainSignals: [],
    });

    const provider: CoachAiProvider = {
      generateDomainStep: capturedRequest,
      generateAgentLoopStep: vi.fn(),
      generateCoachResponse: vi.fn(),
      generateRouterDecision: vi.fn(),
      generateFinalDecision: vi.fn(),
    } as unknown as CoachAiProvider;

    const result = await serviceWithFailingStorage.runDomainLoop({
      domainEntry: makeDomainEntry("nutrition"),
      contextPacket: makeContextPacket("nutrition_adaptation", "adjust_nutrition"),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput({
        userMessage: "Log this meal.",
        attachmentTurn: {
          attachments: [
            {
              attachmentRefId: "a1000001-0000-4000-8000-000000000099",
              category: "food_photo",
              mimeType: "image/jpeg",
              consentState: "none",
              storageRef: "local://attachments/meal.jpg",
            },
          ],
        },
      }),
      provider,
    });

    // The turn must NOT be blocked by the storage error.
    expect(result.degraded).toBe(false);
    expect(capturedRequest).toHaveBeenCalled();
    // imageDataUri is absent (storage read failed).
    const stepRequest = capturedRequest.mock.calls[0]?.[0] as {
      attachmentContext?: {
        items: Array<{ imageDataUri?: string }>;
      };
    };
    expect(stepRequest.attachmentContext?.items[0]?.imageDataUri).toBeUndefined();
  });

  it("returns an empty attachment context (absent field) when no attachments are present", async () => {
    const capturedRequest = vi.fn().mockResolvedValue({
      kind: "domain_answer",
      domain: "nutrition",
      summary: "Nutrition reviewed.",
      candidateProposals: [],
      domainSignals: [],
    });

    const provider: CoachAiProvider = {
      generateDomainStep: capturedRequest,
      generateAgentLoopStep: vi.fn(),
      generateCoachResponse: vi.fn(),
      generateRouterDecision: vi.fn(),
      generateFinalDecision: vi.fn(),
    } as unknown as CoachAiProvider;

    await service.runDomainLoop({
      domainEntry: makeDomainEntry("nutrition"),
      contextPacket: makeContextPacket("nutrition_adaptation", "adjust_nutrition"),
      coachingContext: {},
      orchestratorInput: makeOrchestratorInput({ userMessage: "What should I eat today?" }),
      provider,
    });

    expect(capturedRequest).toHaveBeenCalled();
    const stepRequest = capturedRequest.mock.calls[0]?.[0] as {
      attachmentContext?: unknown;
    };
    // No attachments — field must be absent (undefined), not an empty object.
    expect(stepRequest.attachmentContext).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // All 3 selected domains receive the SAME attachment (no domain-category filter)
  // -------------------------------------------------------------------------

  it("all three selected domains (workout, nutrition, health) receive the same image attachment context", async () => {
    // This test runs three separate domain loops (mirroring the orchestrator's Promise.all)
    // with the same attachment, asserting that the attachment context is threaded into every domain.
    // The domain LLM decides relevance — no category-based filter exists.
    const sharedAttachment = {
      attachmentRefId: "a1111111-0000-4000-8000-000000000001",
      category: "unclassified" as const,
      mimeType: "image/jpeg",
      consentState: "none" as const,
      storageRef: "local://attachments/img.jpg",
    };

    const attachmentTurn = { attachments: [sharedAttachment] };

    const makeCapturingProvider = (domain: "workout" | "nutrition" | "health") => {
      const fn = vi.fn().mockResolvedValue({
        kind: "domain_answer",
        domain,
        summary: `${domain} reviewed.`,
        candidateProposals: [],
        domainSignals: [],
      });

      return {
        fn,
        provider: {
          generateDomainStep: fn,
          generateAgentLoopStep: vi.fn(),
          generateCoachResponse: vi.fn(),
          generateRouterDecision: vi.fn(),
          generateFinalDecision: vi.fn(),
        } as unknown as CoachAiProvider,
      };
    };

    const workoutProvider = makeCapturingProvider("workout");
    const nutritionProvider = makeCapturingProvider("nutrition");
    const healthProvider = makeCapturingProvider("health");

    const orchestratorInput = makeOrchestratorInput({
      userMessage: "How does this affect my fitness goals?",
      attachmentTurn,
    });

    // Run all three domain loops in parallel (mirrors orchestrator).
    await Promise.all([
      service.runDomainLoop({
        domainEntry: makeDomainEntry("workout"),
        contextPacket: makeContextPacket("workout_adaptation", "adjust_workout"),
        coachingContext: {},
        orchestratorInput,
        provider: workoutProvider.provider,
      }),
      service.runDomainLoop({
        domainEntry: makeDomainEntry("nutrition"),
        contextPacket: makeContextPacket("nutrition_adaptation", "adjust_nutrition"),
        coachingContext: {},
        orchestratorInput,
        provider: nutritionProvider.provider,
      }),
      service.runDomainLoop({
        domainEntry: makeDomainEntry("health", ["getUserContextSlice"]),
        contextPacket: makeContextPacket("health_context", "ask_health_context"),
        coachingContext: {},
        orchestratorInput,
        provider: healthProvider.provider,
      }),
    ]);

    type StepReq = { attachmentContext?: { items: Array<{ attachmentRefId: string; category: string }> } };

    const workoutReq = workoutProvider.fn.mock.calls[0]?.[0] as StepReq;
    const nutritionReq = nutritionProvider.fn.mock.calls[0]?.[0] as StepReq;
    const healthReq = healthProvider.fn.mock.calls[0]?.[0] as StepReq;

    // Every domain must receive the attachment context — no domain-to-category gate.
    expect(workoutReq.attachmentContext?.items).toHaveLength(1);
    expect(workoutReq.attachmentContext?.items[0]?.attachmentRefId).toBe(sharedAttachment.attachmentRefId);

    expect(nutritionReq.attachmentContext?.items).toHaveLength(1);
    expect(nutritionReq.attachmentContext?.items[0]?.attachmentRefId).toBe(sharedAttachment.attachmentRefId);

    expect(healthReq.attachmentContext?.items).toHaveLength(1);
    expect(healthReq.attachmentContext?.items[0]?.attachmentRefId).toBe(sharedAttachment.attachmentRefId);
  });
});
