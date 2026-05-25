import { describe, expect, it, vi } from "vitest";
import { AgentToolRegistryService } from "./agent-tool-registry.service.js";

const auth = {
  clerkUserId: "clerk-user-1",
  email: "test@example.com",
  displayName: "Test User",
};

describe("AgentToolRegistryService", () => {
  it("lists the read-only agent tools", () => {
    const service = new AgentToolRegistryService({} as never);

    expect(service.listAvailableTools()).toEqual([
      "getUserContextSlice",
      "getDocumentContext",
      "getWeeklyProgressContext",
    ]);
  });

  it("returns typed validation errors for unknown tool requests", async () => {
    const service = new AgentToolRegistryService({} as never);

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
    const service = new AgentToolRegistryService({
      getUserContextSlice,
    } as never);

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
    const getUserContextSlice = vi.fn(async () => ({
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
    }));

    const service = new AgentToolRegistryService({
      getUserContextSlice,
    } as never);

    const result = await service.executeTool(auth, {
      tool: "getDocumentContext",
      input: {},
    });

    expect(getUserContextSlice).toHaveBeenCalledWith(auth, {
      purpose: "health_context",
      includeDocuments: true,
      includeRawData: false,
    });
    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      documentContext: {
        items: [expect.objectContaining({ title: "Blood panel" })],
      },
      ragResults: [expect.objectContaining({ snippet: "Approved summary only." })],
    });
  });

  it("returns validation errors when getDocumentContext result shape is invalid", async () => {
    const getUserContextSlice = vi.fn(async () => ({
      purpose: "health_context",
      documentContext: { items: "not-an-array", generatedAt: new Date().toISOString() },
      ragResults: [],
    }));

    const service = new AgentToolRegistryService({
      getUserContextSlice,
    } as never);

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

    const service = new AgentToolRegistryService({
      getUserContextSlice,
    } as never);

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

    const service = new AgentToolRegistryService({
      getUserContextSlice,
    } as never);

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
});
