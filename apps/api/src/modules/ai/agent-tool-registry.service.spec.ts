import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONTEXT_BUDGET_POLICY, DEEP_REVIEW_CONTEXT_BUDGET_POLICY } from "@health/types";
import { AgentToolRegistryService } from "./agent-tool-registry.service.js";

const auth = {
  clerkUserId: "clerk-user-1",
  email: "test@example.com",
  displayName: "Test User",
};

/**
 * A minimal stub ContextBudgetPolicyService that delegates applyBudgetToBuiltSlice
 * to the real logic (pass-through to the actual function from the service module).
 * For most tests we just use a pass-through; specific tests supply a tracking mock.
 */
function createStubContextBudgetPolicyService(
  applyBudgetOverride?: ReturnType<typeof vi.fn>,
) {
  return {
    applyBudgetToBuiltSlice: applyBudgetOverride ?? vi.fn((slice: unknown) => slice),
  } as never;
}

describe("AgentToolRegistryService", () => {
  it("lists the read-only agent tools", () => {
    const service = new AgentToolRegistryService(
      {} as never,
      createStubContextBudgetPolicyService(),
    );

    expect(service.listAvailableTools()).toEqual([
      "getUserContextSlice",
      "getDocumentContext",
      "getWeeklyProgressContext",
    ]);
  });

  it("returns typed validation errors for unknown tool requests", async () => {
    const service = new AgentToolRegistryService(
      {} as never,
      createStubContextBudgetPolicyService(),
    );

    const result = await service.executeTool(auth, {
      tool: "deleteUserData",
      input: {},
    } as never);

    expect(result.ok).toBe(false);
    expect(result.tool).toBe("getUserContextSlice");
    expect(result.errors.some((error) => /tool/i.test(error))).toBe(true);
  });

  it("returns typed validation errors for invalid getUserContextSlice input", async () => {
    const getUserContextSlice = vi.fn();
    const service = new AgentToolRegistryService(
      { getUserContextSlice } as never,
      createStubContextBudgetPolicyService(),
    );

    const result = await service.executeTool(auth, {
      tool: "getUserContextSlice",
      input: { purpose: "not_a_valid_purpose" },
    });

    expect(result.ok).toBe(false);
    expect(result.tool).toBe("getUserContextSlice");
    expect(result.errors.some((error) => /purpose/i.test(error))).toBe(true);
    expect(getUserContextSlice).not.toHaveBeenCalled();
  });

  it("loads document context through the consent-gated health slice", async () => {
    const rawSlice = {
      purpose: "health_context",
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
    };

    const getUserContextSlice = vi.fn(async () => rawSlice);
    // Budget that allows documents (simulates health domain with allowDocuments=true)
    const budgetWithDocuments = {
      ...DEFAULT_CONTEXT_BUDGET_POLICY,
      allowDocuments: true,
      allowSensitiveHealthContext: true,
    };
    const applyBudgetToBuiltSlice = vi.fn((slice: unknown) => slice);

    const service = new AgentToolRegistryService(
      { getUserContextSlice } as never,
      { applyBudgetToBuiltSlice } as never,
    );

    const result = await service.executeTool(
      auth,
      { tool: "getDocumentContext", input: {} },
      budgetWithDocuments,
    );

    expect(getUserContextSlice).toHaveBeenCalledWith(auth, {
      purpose: "health_context",
      includeDocuments: true,
      includeRawData: false,
    });
    // Budget floor must be applied after the slice is built.
    expect(applyBudgetToBuiltSlice).toHaveBeenCalledWith(rawSlice, budgetWithDocuments);
    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      documentContext: {
        items: [expect.objectContaining({ title: "Blood panel" })],
      },
      ragResults: [expect.objectContaining({ snippet: "Approved summary only." })],
    });
  });

  it("strips document context when budget denies documents (deny-by-default floor)", async () => {
    const rawSlice = {
      purpose: "health_context",
      documentContext: {
        items: [
          {
            documentId: "d2000001-0000-4000-8000-000000000001",
            summaryId: "a2000001-0000-4000-8000-000000000001",
            documentType: "lab_report",
            title: "Should be stripped",
            summarySnippet: "Sensitive content.",
            extractedConstraints: [],
          },
        ],
        generatedAt: new Date().toISOString(),
      },
      ragResults: [],
    };
    // Budget that denies documents (the deny-by-default floor)
    const denyBudget = { ...DEFAULT_CONTEXT_BUDGET_POLICY, allowDocuments: false };

    const getUserContextSlice = vi.fn(async () => rawSlice);
    // The real applyBudgetToBuiltSlice strips documentContext when allowDocuments=false.
    const applyBudgetToBuiltSlice = vi.fn((slice: Record<string, unknown>) => ({
      ...slice,
      documentContext: undefined,
      ragResults: undefined,
    }));

    const service = new AgentToolRegistryService(
      { getUserContextSlice } as never,
      { applyBudgetToBuiltSlice } as never,
    );

    const result = await service.executeTool(
      auth,
      { tool: "getDocumentContext", input: {} },
      denyBudget,
    );

    expect(applyBudgetToBuiltSlice).toHaveBeenCalledWith(rawSlice, denyBudget);
    // After budget strips documents, result falls back to empty documentContext.
    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      documentContext: { items: [] },
      ragResults: [],
    });
  });

  it("falls back to DEFAULT_CONTEXT_BUDGET_POLICY when no budget is passed to executeTool", async () => {
    const rawSlice = {
      purpose: "health_context",
      documentContext: {
        items: [],
        generatedAt: new Date().toISOString(),
      },
      ragResults: [],
    };

    const getUserContextSlice = vi.fn(async () => rawSlice);
    const applyBudgetToBuiltSlice = vi.fn((slice: unknown) => slice);

    const service = new AgentToolRegistryService(
      { getUserContextSlice } as never,
      { applyBudgetToBuiltSlice } as never,
    );

    // Call without contextBudget — should use DEFAULT_CONTEXT_BUDGET_POLICY.
    await service.executeTool(auth, { tool: "getDocumentContext", input: {} });

    expect(applyBudgetToBuiltSlice).toHaveBeenCalledWith(rawSlice, DEFAULT_CONTEXT_BUDGET_POLICY);
  });

  it("returns validation errors when getDocumentContext result shape is invalid", async () => {
    const getUserContextSlice = vi.fn(async () => ({
      purpose: "health_context",
      documentContext: { items: "not-an-array", generatedAt: new Date().toISOString() },
      ragResults: [],
    }));

    const service = new AgentToolRegistryService(
      { getUserContextSlice } as never,
      createStubContextBudgetPolicyService(),
    );

    const result = await service.executeTool(auth, {
      tool: "getDocumentContext",
      input: {},
    });

    expect(result.ok).toBe(false);
    expect(result.tool).toBe("getDocumentContext");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns validation errors when getWeeklyProgressContext result shape is invalid", async () => {
    const getUserContextSlice = vi.fn(async () => ({
      purpose: "weekly_review",
      weeklyProgress: { weekStart: "not-a-date" },
    }));

    const service = new AgentToolRegistryService(
      { getUserContextSlice } as never,
      createStubContextBudgetPolicyService(),
    );

    const result = await service.executeTool(auth, {
      tool: "getWeeklyProgressContext",
      input: {},
    });

    expect(result.ok).toBe(false);
    expect(result.tool).toBe("getWeeklyProgressContext");
    expect(result.errors.some((error) => /weekStart|result/i.test(error))).toBe(true);
  });

  it("loads weekly progress context without document access", async () => {
    const getUserContextSlice = vi.fn(async () => ({
      purpose: "weekly_review",
      weeklyProgress: {
        weekStart: "2026-05-19",
        weekEnd: "2026-05-25",
        dataStatus: "partial",
        userMessage: "You completed 2 of 3 planned workouts this week.",
        trends: [],
      },
    }));

    const service = new AgentToolRegistryService(
      { getUserContextSlice } as never,
      createStubContextBudgetPolicyService(),
    );

    const result = await service.executeTool(auth, {
      tool: "getWeeklyProgressContext",
      input: {},
    });

    expect(getUserContextSlice).toHaveBeenCalledWith(auth, {
      purpose: "weekly_review",
      includeRawData: false,
      includeDocuments: false,
    });
    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      userMessage: "You completed 2 of 3 planned workouts this week.",
    });
  });

  it("passes the per-domain context budget to getDocumentContext (DEEP_REVIEW budget allows documents)", async () => {
    const rawSlice = {
      purpose: "health_context",
      documentContext: {
        items: [
          {
            documentId: "d3000001-0000-4000-8000-000000000001",
            summaryId: "a3000001-0000-4000-8000-000000000001",
            documentType: "lab_report",
            title: "Deep review document",
            summarySnippet: "Approved for deep review.",
            extractedConstraints: [],
          },
        ],
        generatedAt: new Date().toISOString(),
      },
      ragResults: [],
    };
    const getUserContextSlice = vi.fn(async () => rawSlice);
    const applyBudgetToBuiltSlice = vi.fn((slice: unknown) => slice);

    const service = new AgentToolRegistryService(
      { getUserContextSlice } as never,
      { applyBudgetToBuiltSlice } as never,
    );

    await service.executeTool(
      auth,
      { tool: "getDocumentContext", input: {} },
      DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
    );

    // The DEEP_REVIEW budget (not the default) must be passed to applyBudgetToBuiltSlice.
    expect(applyBudgetToBuiltSlice).toHaveBeenCalledWith(rawSlice, DEEP_REVIEW_CONTEXT_BUDGET_POLICY);
  });
});
