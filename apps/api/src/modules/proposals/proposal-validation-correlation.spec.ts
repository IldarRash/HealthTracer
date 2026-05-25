import { describe, expect, it } from "vitest";
import { ProposalValidationService } from "./proposal-validation.service.js";

describe("ProposalValidationService correlation evidence", () => {
  it("rejects unsafe evidence labels in raw proposals", () => {
    const service = new ProposalValidationService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { buildSummaryForUser: async () => ({ items: [], generatedAt: new Date().toISOString() }) } as never,
      { listByUserId: async () => [] } as never,
      {
        computeAndPersistSnapshot: async () => ({
          id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
          band: "moderate_load",
        }),
      } as never,
      {
        findActivePlanByUserId: async () => null,
        findRevisionById: async () => null,
      } as never,
      { findByUserId: async () => ({ timezone: "UTC" }) } as never,
    );

    const result = service.validateRawProposal({
      intent: "summarize_progress",
      targetDomain: "general",
      title: "Review recent recovery patterns",
      reason: "Training load looked heavy recently.",
      proposedChanges: {},
      evidenceRefs: [
        {
          type: "document_signal",
          id: "14a08176-64a7-4a2d-8a44-581807368394",
          label: "This confirms a diagnosis from your lab report",
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("unsafe medical wording"))).toBe(true);
  });
});
