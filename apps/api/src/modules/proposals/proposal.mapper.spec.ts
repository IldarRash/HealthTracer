import { describe, expect, it } from "vitest";
import { toAiProposal } from "./proposal.mapper.js";
import type { AiProposalRow } from "../chat/chat.repository.js";

const baseRow: AiProposalRow = {
  id: "14a08176-64a7-4a2d-8a44-581807368394",
  userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  threadId: "24b19287-75b8-4a3e-9c10-691908479405",
  sourceMessageId: "880099c6-3b5f-4383-8246-97b72bf61818",
  intent: "summarize_progress",
  targetDomain: "general",
  title: "Review recent recovery patterns",
  reason: "Training load looked heavy recently.",
  evidenceRefs: null,
  proposedChanges: {},
  status: "pending",
  validationStatus: "valid",
  validationErrors: [],
  userDecisionAt: null,
  appliedReference: null,
  createdAt: new Date("2026-05-22T12:00:00.000Z"),
  updatedAt: new Date("2026-05-22T12:00:00.000Z"),
};

describe("toAiProposal", () => {
  it("returns persisted evidenceRefs for reload-safe chat proposals", () => {
    const evidenceRefs = [
      {
        type: "document_signal" as const,
        id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
        label: "Vitamin D from recent lab review",
      },
    ];

    const mapped = toAiProposal({
      ...baseRow,
      evidenceRefs,
    });

    expect(mapped.evidenceRefs).toEqual(evidenceRefs);
  });

  it("omits evidenceRefs when none were persisted", () => {
    const mapped = toAiProposal(baseRow);

    expect(mapped.evidenceRefs).toBeUndefined();
  });
});
