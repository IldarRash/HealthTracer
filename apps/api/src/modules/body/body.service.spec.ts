/**
 * Unit tests for BodyService — the domain service that persists body-composition
 * analyses from accepted save_body_analysis proposals.
 *
 * Safety floors verified here:
 *  - accepted proposal → writes body_composition_analyses record via bodyRepository
 *  - returns a "body_analysis:<id>" reference string
 *  - read path is ownership-scoped (passes userId to repository)
 *  - no photo data or mutation logic lives in this service
 */
import { describe, expect, it } from "vitest";
import { BodyService } from "./body.service.js";
import { BODY_ANALYSIS_DISCLAIMER } from "@health/types";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const sourceProposalId = "14a08176-64a7-4a2d-8a44-581807368394";

const bodyPayload = {
  date: "2026-06-08",
  source: "chat" as const,
  fatPctMin: 18,
  fatPctMax: 22,
  muscleTone: "average" as const,
  weightKg: 78,
  weightSelfReported: true,
  strongGroups: ["chest", "shoulders"],
  weakGroups: ["lower_back"],
  muscleMap: { chest: "strong" as const, lower_back: "weak" as const },
};

const stubAnalysisRecord = {
  id: "bca-001",
  userId,
  date: "2026-06-08",
  source: "chat",
  fatPctMin: 18,
  fatPctMax: 22,
  muscleTone: "average" as const,
  weightKg: 78,
  weightSelfReported: true,
  strongGroups: ["chest", "shoulders"],
  weakGroups: ["lower_back"],
  muscleMap: { chest: "strong" as const, lower_back: "weak" as const },
  fatPctTrend: [],
  analysisHistory: [],
  sourceProposalId,
  disclaimer: BODY_ANALYSIS_DISCLAIMER,
  createdAt: "2026-06-08T00:00:00.000Z",
};

function createRepoMock(overrides: Record<string, unknown> = {}) {
  return {
    findLatestAnalysisByUserId: async () => null,
    listAnalysesByUserId: async () => [],
    findAnalysisByIdForUser: async () => null,
    createAnalysis: async () => stubAnalysisRecord,
    ...overrides,
  };
}

describe("BodyService.applyBodyAnalysisProposal", () => {
  it("calls bodyRepository.createAnalysis with userId, proposalId, and payload", async () => {
    let capturedUserId: string | undefined;
    let capturedProposalId: string | undefined;
    let capturedPayload: unknown;

    const service = new BodyService(
      createRepoMock({
        createAnalysis: async (uid: string, pid: string, payload: unknown) => {
          capturedUserId = uid;
          capturedProposalId = pid;
          capturedPayload = payload;
          return stubAnalysisRecord;
        },
      }) as never,
    );

    const reference = await service.applyBodyAnalysisProposal(
      userId,
      sourceProposalId,
      bodyPayload,
    );

    expect(capturedUserId).toBe(userId);
    expect(capturedProposalId).toBe(sourceProposalId);
    expect(capturedPayload).toMatchObject({
      source: "chat",
      fatPctMin: 18,
      fatPctMax: 22,
      muscleTone: "average",
    });
    // No photo data in the payload
    expect(JSON.stringify(capturedPayload)).not.toContain("photo");
    expect(JSON.stringify(capturedPayload)).not.toContain("image");
    expect(reference).toBe("body_analysis:bca-001");
  });

  it("returns a body_analysis:<id> reference matching the persisted record id", async () => {
    const service = new BodyService(
      createRepoMock({
        createAnalysis: async () => ({ ...stubAnalysisRecord, id: "bca-xyz-789" }),
      }) as never,
    );

    const reference = await service.applyBodyAnalysisProposal(
      userId,
      sourceProposalId,
      bodyPayload,
    );

    expect(reference).toBe("body_analysis:bca-xyz-789");
  });

  it("surfaces repository errors without swallowing them", async () => {
    const service = new BodyService(
      createRepoMock({
        createAnalysis: async () => {
          throw new Error("db_constraint");
        },
      }) as never,
    );

    await expect(
      service.applyBodyAnalysisProposal(userId, sourceProposalId, bodyPayload),
    ).rejects.toThrow("db_constraint");
  });
});

describe("BodyService.getLatestAnalysis", () => {
  it("returns null when no analysis exists", async () => {
    const service = new BodyService(createRepoMock() as never);
    const result = await service.getLatestAnalysis(userId);
    expect(result).toBeNull();
  });

  it("passes userId to repository (ownership-scoped)", async () => {
    let resolvedUserId: string | undefined;

    const service = new BodyService(
      createRepoMock({
        findLatestAnalysisByUserId: async (uid: string) => {
          resolvedUserId = uid;
          return null;
        },
      }) as never,
    );

    await service.getLatestAnalysis(userId);
    expect(resolvedUserId).toBe(userId);
  });

  it("returns the latest analysis record from repository", async () => {
    const service = new BodyService(
      createRepoMock({
        findLatestAnalysisByUserId: async () => stubAnalysisRecord,
      }) as never,
    );

    const result = await service.getLatestAnalysis(userId);
    expect(result?.id).toBe("bca-001");
    expect(result?.disclaimer).toBe(BODY_ANALYSIS_DISCLAIMER);
  });
});

describe("BodyService.listAnalyses", () => {
  it("returns an empty array when no analyses exist", async () => {
    const service = new BodyService(createRepoMock() as never);
    const result = await service.listAnalyses(userId);
    expect(result).toEqual([]);
  });

  it("passes userId to repository (ownership-scoped)", async () => {
    let resolvedUserId: string | undefined;

    const service = new BodyService(
      createRepoMock({
        listAnalysesByUserId: async (uid: string) => {
          resolvedUserId = uid;
          return [];
        },
      }) as never,
    );

    await service.listAnalyses(userId);
    expect(resolvedUserId).toBe(userId);
  });

  it("returns multiple records in the order returned by the repository", async () => {
    const record2 = { ...stubAnalysisRecord, id: "bca-002", date: "2026-06-01" };
    const service = new BodyService(
      createRepoMock({
        listAnalysesByUserId: async () => [stubAnalysisRecord, record2],
      }) as never,
    );

    const result = await service.listAnalyses(userId);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("bca-001");
    expect(result[1]?.id).toBe("bca-002");
  });
});
