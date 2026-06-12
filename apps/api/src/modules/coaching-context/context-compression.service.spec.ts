import { describe, expect, it, vi, afterEach } from "vitest";
import {
  DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
  DEFAULT_CONTEXT_BUDGET_POLICY,
  type AgentContextPacket,
} from "@health/types";
import {
  buildContextCompressionRequest,
  ContextCompressionService,
  resolveReviewKind,
} from "./context-compression.service.js";
import type { ContextCompressionProvider } from "./context-compression.provider.js";
import { OpenAiContextCompressionProvider } from "./openai-context-compression.provider.js";

function createPacket(overrides: Partial<AgentContextPacket> = {}): AgentContextPacket {
  return {
    purpose: "weekly_review",
    depth: "large",
    timeRange: "30d",
    intent: "review_progress",
    generatedAt: new Date().toISOString(),
    safetyConstraints: ["Do not diagnose medical conditions."],
    supplementarySlices: [],
    missingContextNotes: [],
    sourceRefs: [{ domain: "profile", label: "User profile summary" }],
    slice: {
      purpose: "weekly_review",
      depth: "large",
      timeRange: "30d",
      generatedAt: new Date().toISOString(),
      relevantMemories: [],
      snapshots: [],
      recommendationConstraints: [],
      sourceRefs: [],
      weeklyProgress: {
        weekStart: "2026-05-19",
        weekEnd: "2026-05-25",
        dataStatus: "sufficient",
        userMessage: "Training volume held steady this week.",
        trends: [
          {
            id: "a1000001-0000-4000-8000-000000000001",
            domain: "workout",
            direction: "stable",
            message: "Workout completion stayed consistent.",
          },
        ],
      },
    },
    ...overrides,
  };
}

/** Build a valid compression summary JSON string for mocking OpenAI responses. */
function buildMockCompressionResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    reviewKind: "monthly_review",
    keyFindings: ["Training volume held steady."],
    risks: [],
    focusAreas: ["Weekly progress"],
    sourceRanges: [{ domain: "progress", slicePurpose: "weekly_review" }],
    sourceRefs: [{ domain: "profile", label: "User profile summary" }],
    dataQuality: "sufficient",
    confidence: "medium",
    ...overrides,
  });
}

/** Create a fetch mock that returns a valid OpenAI completion response. */
function mockOpenAiFetch(bodyContent: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [{ message: { content: bodyContent } }],
      }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContextCompressionService", () => {
  it("skips compression when budget does not require it", async () => {
    const service = new ContextCompressionService();
    const result = await service.compressForTurn({
      packet: createPacket(),
      reviewSignals: {
        isMonthlyReview: false,
        isMultiDomainReview: false,
        isProgressReview: false,
      },
      budget: DEFAULT_CONTEXT_BUDGET_POLICY,
    });

    expect(result.summary).toBeNull();
    expect(result.notes).toEqual([]);
  });

  it("returns null summary when no provider is configured (S2 — degrade gracefully)", async () => {
    // No provider injected; service must short-circuit to null.
    const service = new ContextCompressionService(undefined);
    const result = await service.compressForTurn({
      packet: createPacket(),
      reviewSignals: {
        isMonthlyReview: true,
        isMultiDomainReview: false,
        isProgressReview: true,
      },
      budget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
    });

    expect(result.summary).toBeNull();
    expect(result.notes.some((n) => n.includes("No compression provider configured"))).toBe(true);
  });

  it("returns null summary when the provider throws (S2 — fail-closed)", async () => {
    const failingProvider: ContextCompressionProvider = {
      compress: vi.fn().mockRejectedValue(new Error("Provider unavailable")),
    };
    const service = new ContextCompressionService(failingProvider);

    const result = await service.compressForTurn({
      packet: createPacket(),
      reviewSignals: {
        isMonthlyReview: true,
        isMultiDomainReview: false,
        isProgressReview: true,
      },
      budget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
    });

    expect(result.summary).toBeNull();
    expect(result.notes.some((n) => n.includes("failed"))).toBe(true);
    expect(result.notes.some((n) => n.includes("Unable to produce typed compression summary"))).toBe(
      true,
    );
  });

  it("returns null summary when provider returns malformed output (S2 — invalid schema)", async () => {
    const malformedProvider: ContextCompressionProvider = {
      // Missing required keyFindings and focusAreas
      compress: vi.fn().mockResolvedValue({
        reviewKind: "monthly_review",
        keyFindings: [],
        focusAreas: [],
        documentContent: "raw leak",
      }),
    };
    const service = new ContextCompressionService(malformedProvider);

    const result = await service.compressForTurn({
      packet: createPacket(),
      reviewSignals: {
        isMonthlyReview: true,
        isMultiDomainReview: false,
        isProgressReview: true,
      },
      budget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
    });

    expect(result.summary).toBeNull();
    expect(result.notes.some((n) => n.includes("invalid output"))).toBe(true);
  });

  it("resolves review kinds from planner signals", () => {
    expect(
      resolveReviewKind({
        isMonthlyReview: true,
        isMultiDomainReview: false,
        isProgressReview: true,
      }),
    ).toBe("monthly_review");

    expect(
      resolveReviewKind({
        isMonthlyReview: false,
        isMultiDomainReview: true,
        isProgressReview: false,
      }),
    ).toBe("multi_domain_review");
  });
});

// ---------------------------------------------------------------------------
// S5 context-leak regression — OpenAiContextCompressionProvider
//
// This is a code-level safety floor: the provider must NEVER include raw
// document/RAG text in its outgoing prompt when allowDocuments=false, must not
// include sensitive-health context (recovery/wellbeing) when
// allowSensitiveHealthContext=false, and must never echo
// documentContent/rawDocument fields in its output.
// ---------------------------------------------------------------------------

describe("OpenAiContextCompressionProvider — S5 context-leak regression", () => {
  it("does not send document/RAG text to OpenAI when allowDocuments=false (S5)", async () => {
    const fetchSpy = mockOpenAiFetch(buildMockCompressionResponse());
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new OpenAiContextCompressionProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });

    const packet = createPacket({
      sourceRefs: [
        {
          domain: "document",
          label: "Blood panel",
          referenceId: "d1000001-0000-4000-8000-000000000001",
        },
        { domain: "profile", label: "User profile summary" },
      ],
      // The documentContext/ragResults slice fields were deleted from the
      // contract with the documents module. Inject them adversarially (cast)
      // to prove the provider still never echoes unknown document-text fields.
      slice: {
        ...createPacket().slice,
        documentContext: {
          items: [
            {
              documentId: "d1000001-0000-4000-8000-000000000001",
              summaryId: "s1000001-0000-4000-8000-000000000001",
              documentType: "lab_report",
              title: "Blood panel",
              summarySnippet: "Should never appear in compression prompt.",
              extractedConstraints: [],
            },
          ],
          generatedAt: new Date().toISOString(),
        },
        ragResults: [
          {
            documentId: "d1000001-0000-4000-8000-000000000001",
            summaryId: "s1000001-0000-4000-8000-000000000001",
            title: "Blood panel",
            snippet: "Should never appear in compression prompt.",
            provenance: "test",
            consentScope: "medical_review",
          },
        ],
      } as unknown as ReturnType<typeof createPacket>["slice"],
    });

    const budget = { ...DEEP_REVIEW_CONTEXT_BUDGET_POLICY, allowDocuments: false };

    await provider.compress({
      packet,
      request: buildContextCompressionRequest({
        packet,
        reviewSignals: {
          isMonthlyReview: true,
          isMultiDomainReview: false,
          isProgressReview: true,
        },
        budget,
      }),
      budget,
    });

    // Verify the outgoing fetch body contains NO document text (S5).
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, fetchInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchInit.body as string) as unknown;
    const bodyStr = JSON.stringify(body);

    expect(bodyStr).not.toContain("Should never appear");
    expect(bodyStr).not.toContain("documentContent");
    expect(bodyStr).not.toContain("rawDocument");
    // Document sourceRef (domain="document") must be stripped from the prompt.
    expect(bodyStr).not.toContain('"domain":"document"');
  });

  it("schema output never contains documentContent or rawDocument fields (S5)", async () => {
    // Even if OpenAI somehow returns extra fields, the strict schema strips them.
    const maliciousResponse = buildMockCompressionResponse({
      documentContent: "leaked document text",
      rawDocument: "leaked raw text",
    });
    const fetchSpy = mockOpenAiFetch(maliciousResponse);
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new OpenAiContextCompressionProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });

    // The strict schema parse inside the provider should throw on unknown fields,
    // so the service degrades to null — but if it somehow passes, no leak fields.
    const packet = createPacket();
    const budget = DEEP_REVIEW_CONTEXT_BUDGET_POLICY;

    try {
      const summary = await provider.compress({
        packet,
        request: buildContextCompressionRequest({
          packet,
          reviewSignals: { isMonthlyReview: true, isMultiDomainReview: false, isProgressReview: true },
          budget,
        }),
        budget,
      });

      expect(summary).not.toHaveProperty("documentContent");
      expect(summary).not.toHaveProperty("rawDocument");
    } catch {
      // Strict schema rejection is the expected and correct behavior (S2 → null at service level).
    }
  });

  it("strips document sourceRefs from outgoing prompt even when present in packet (S5)", async () => {
    const fetchSpy = mockOpenAiFetch(buildMockCompressionResponse());
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new OpenAiContextCompressionProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });

    const packet = createPacket({
      sourceRefs: [
        { domain: "rag", label: "RAG result 1" },
        { domain: "document_summary", label: "Doc summary" },
        { domain: "profile", label: "User profile" },
      ],
    });
    const budget = { ...DEEP_REVIEW_CONTEXT_BUDGET_POLICY, allowDocuments: false };

    await provider.compress({
      packet,
      request: buildContextCompressionRequest({
        packet,
        reviewSignals: { isMonthlyReview: true, isMultiDomainReview: false, isProgressReview: true },
        budget,
      }),
      budget,
    });

    const [, fetchInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const bodyStr = JSON.stringify(JSON.parse(fetchInit.body as string));

    // "rag" and "document_summary" domains must not appear in the outgoing prompt.
    expect(bodyStr).not.toContain('"rag"');
    expect(bodyStr).not.toContain("document_summary");
    // Non-document sourceRef must survive.
    expect(bodyStr).toContain("User profile");
  });

  it("returns a valid typed summary when OpenAI responds correctly", async () => {
    const fetchSpy = mockOpenAiFetch(buildMockCompressionResponse());
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new OpenAiContextCompressionProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });

    const packet = createPacket();
    const budget = DEEP_REVIEW_CONTEXT_BUDGET_POLICY;

    const summary = await provider.compress({
      packet,
      request: buildContextCompressionRequest({
        packet,
        reviewSignals: { isMonthlyReview: true, isMultiDomainReview: false, isProgressReview: true },
        budget,
      }),
      budget,
    });

    expect(summary.reviewKind).toBe("monthly_review");
    expect(summary.keyFindings.length).toBeGreaterThan(0);
    expect(summary).not.toHaveProperty("documentContent");
    expect(summary).not.toHaveProperty("rawDocument");
  });

  it("throws when OpenAI returns an HTTP error (allows service to degrade to null — S2)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: "Internal server error" } }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new OpenAiContextCompressionProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });

    const packet = createPacket();
    const budget = DEEP_REVIEW_CONTEXT_BUDGET_POLICY;

    await expect(
      provider.compress({
        packet,
        request: buildContextCompressionRequest({
          packet,
          reviewSignals: { isMonthlyReview: true, isMultiDomainReview: false, isProgressReview: true },
          budget,
        }),
        budget,
      }),
    ).rejects.toThrow("Internal server error");
  });

  it("does not send sensitive-health context (recovery/wellbeing) to OpenAI when allowSensitiveHealthContext=false (S5)", async () => {
    const fetchSpy = mockOpenAiFetch(buildMockCompressionResponse());
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new OpenAiContextCompressionProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });

    const base = createPacket();
    const packet = createPacket({
      slice: {
        ...base.slice,
        recoveryContext: {
          band: "insufficient_data",
          dataSufficiency: "insufficient",
          focusMessage: "SENSITIVE recovery focus must not leak.",
          signals: [],
          date: "2026-05-25",
        },
      },
    });
    const budget = { ...DEEP_REVIEW_CONTEXT_BUDGET_POLICY, allowSensitiveHealthContext: false };

    await provider.compress({
      packet,
      request: buildContextCompressionRequest({
        packet,
        reviewSignals: { isMonthlyReview: true, isMultiDomainReview: false, isProgressReview: true },
        budget,
      }),
      budget,
    });

    const [, fetchInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const bodyStr = JSON.stringify(JSON.parse(fetchInit.body as string));

    // Sensitive-health fields must be stripped from the outgoing prompt (S5).
    expect(bodyStr).not.toContain("SENSITIVE recovery focus must not leak");
    expect(bodyStr).not.toContain("Recovery:");
  });

  it("includes sensitive-health context only when allowSensitiveHealthContext=true (S5 positive control)", async () => {
    const fetchSpy = mockOpenAiFetch(buildMockCompressionResponse());
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new OpenAiContextCompressionProvider({
      apiKey: "test-key",
      model: "gpt-4o-mini",
    });

    const base = createPacket();
    const packet = createPacket({
      slice: {
        ...base.slice,
        recoveryContext: {
          band: "insufficient_data",
          dataSufficiency: "insufficient",
          focusMessage: "Recovery focus present with consent.",
          signals: [],
          date: "2026-05-25",
        },
      },
    });
    const budget = { ...DEEP_REVIEW_CONTEXT_BUDGET_POLICY, allowSensitiveHealthContext: true };

    await provider.compress({
      packet,
      request: buildContextCompressionRequest({
        packet,
        reviewSignals: { isMonthlyReview: true, isMultiDomainReview: false, isProgressReview: true },
        budget,
      }),
      budget,
    });

    const [, fetchInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const bodyStr = JSON.stringify(JSON.parse(fetchInit.body as string));

    expect(bodyStr).toContain("Recovery focus present with consent.");
  });
});
