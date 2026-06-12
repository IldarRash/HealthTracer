import { describe, expect, it, vi } from "vitest";
import { ChatRepository } from "./chat.repository.js";

describe("ChatRepository.createProposal", () => {
  it("persists optional evidenceRefs on inserted proposals", async () => {
    const evidenceRefs = [
      {
        type: "biomarker_reading" as const,
        id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
        label: "Vitamin D from recent lab review",
      },
    ];

    let insertedValues: Record<string, unknown> | undefined;

    const returning = vi.fn(async () => [
      {
        id: "14a08176-64a7-4a2d-8a44-581807368394",
        userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        threadId: "24b19287-75b8-4a3e-9c10-691908479405",
        sourceMessageId: "880099c6-3b5f-4383-8246-97b72bf61818",
        intent: "summarize_progress",
        targetDomain: "general",
        title: "Review recent recovery patterns",
        reason: "Training load looked heavy recently.",
        evidenceRefs,
        proposedChanges: {},
        status: "pending",
        validationStatus: "valid",
        validationErrors: [],
        userDecisionAt: null,
        appliedReference: null,
        createdAt: new Date("2026-05-22T12:00:00.000Z"),
        updatedAt: new Date("2026-05-22T12:00:00.000Z"),
      },
    ]);

    const insert = vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        insertedValues = values;
        return { returning };
      }),
    }));

    const update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    }));

    const tx = { update, insert };
    const db = {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    const repository = new ChatRepository(db as never);

    const record = await repository.createProposal(
      "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      "24b19287-75b8-4a3e-9c10-691908479405",
      "880099c6-3b5f-4383-8246-97b72bf61818",
      {
        intent: "summarize_progress",
        targetDomain: "general",
        title: "Review recent recovery patterns",
        reason: "Training load looked heavy recently.",
        proposedChanges: {},
        evidenceRefs,
      },
      "valid",
      [],
    );

    expect(insertedValues?.evidenceRefs).toEqual(evidenceRefs);
    expect(record.evidenceRefs).toEqual(evidenceRefs);
  });

  it("stores null evidenceRefs when proposal omits them", async () => {
    let insertedValues: Record<string, unknown> | undefined;

    const returning = vi.fn(async () => [
      {
        id: "14a08176-64a7-4a2d-8a44-581807368394",
        userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        threadId: "24b19287-75b8-4a3e-9c10-691908479405",
        sourceMessageId: null,
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
      },
    ]);

    const insert = vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        insertedValues = values;
        return { returning };
      }),
    }));

    const update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    }));

    const tx = { update, insert };
    const db = {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    const repository = new ChatRepository(db as never);

    await repository.createProposal(
      "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      "24b19287-75b8-4a3e-9c10-691908479405",
      null,
      {
        intent: "summarize_progress",
        targetDomain: "general",
        title: "Review recent recovery patterns",
        reason: "Training load looked heavy recently.",
        proposedChanges: {},
      },
      "valid",
      [],
    );

    expect(insertedValues?.evidenceRefs).toBeNull();
  });
});
