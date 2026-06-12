import type { ProposalRepairProvider } from "@health/ai";
import type { RawAiProposal } from "@health/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProposalRepairService } from "./proposal-repair.service.js";

const baseProposal = {
  intent: "adapt_workout_plan",
  targetDomain: "workout",
  title: "Adapt your workout plan",
  reason: "Recent sessions looked heavy.",
  proposedChanges: { title: "Plan", days: "not-an-array" },
} as unknown as RawAiProposal;

const validationErrors = ["proposedChanges.days: Expected array, received string"];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ProposalRepairService", () => {
  it("returns a repaired proposal keeping the original envelope fields", async () => {
    const correctedChanges = { title: "Plan", days: [] };
    const repairProposal = vi.fn().mockResolvedValue({ proposedChanges: correctedChanges });
    const service = new ProposalRepairService({ repairProposal });

    const repaired = await service.tryRepair(baseProposal, validationErrors);

    expect(repaired).toEqual({
      proposal: {
        intent: "adapt_workout_plan",
        targetDomain: "workout",
        title: "Adapt your workout plan",
        reason: "Recent sessions looked heavy.",
        proposedChanges: correctedChanges,
      },
    });
    expect(repairProposal).toHaveBeenCalledTimes(1);
    expect(repairProposal).toHaveBeenCalledWith(
      {
        intent: "adapt_workout_plan",
        proposedChanges: baseProposal.proposedChanges,
        validationErrors,
      },
      { signal: expect.any(AbortSignal) },
    );
  });

  it("threads the provider's usage through to the repair outcome", async () => {
    const usage = {
      promptTokens: 120,
      completionTokens: 45,
      totalTokens: 165,
      latencyMs: 900,
      retries: 0,
      model: "gpt-4o-mini",
    };
    const service = new ProposalRepairService({
      repairProposal: vi
        .fn()
        .mockResolvedValue({ proposedChanges: { title: "Plan", days: [] }, usage }),
    });

    const repaired = await service.tryRepair(baseProposal, validationErrors);

    expect(repaired?.usage).toEqual(usage);
  });

  it("returns null when the provider throws", async () => {
    const service = new ProposalRepairService({
      repairProposal: vi.fn().mockRejectedValue(new Error("OpenAI proposal repair provider request failed with status 500.")),
    });

    await expect(service.tryRepair(baseProposal, validationErrors)).resolves.toBeNull();
  });

  it("returns null when the provider returns a non-object payload", async () => {
    const service = new ProposalRepairService({
      repairProposal: vi.fn().mockResolvedValue({ proposedChanges: "not-an-object" }),
    });

    await expect(service.tryRepair(baseProposal, validationErrors)).resolves.toBeNull();
  });

  it("returns null when the provider call exceeds the 10s timeout", async () => {
    vi.useFakeTimers();

    const provider: ProposalRepairProvider = {
      repairProposal: (_request, options) =>
        new Promise((_resolve, reject) => {
          // Simulate an in-flight HTTP call that only resolves via abort.
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    };
    const service = new ProposalRepairService(provider);

    const pending = service.tryRepair(baseProposal, validationErrors);
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(pending).resolves.toBeNull();
  });

  it("returns null without any provider call when no provider is configured", async () => {
    const service = new ProposalRepairService();

    expect(service.isAvailable).toBe(false);
    await expect(service.tryRepair(baseProposal, validationErrors)).resolves.toBeNull();
  });

  it("reports isAvailable when a provider is configured", () => {
    const service = new ProposalRepairService({ repairProposal: vi.fn() });

    expect(service.isAvailable).toBe(true);
  });
});
