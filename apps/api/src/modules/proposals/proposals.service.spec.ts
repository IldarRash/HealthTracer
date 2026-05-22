import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ProposalsService } from "./proposals.service.js";

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

const user = {
  id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  displayName: "Test User",
  email: "test@example.com",
  timezone: "UTC",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const pendingProposal = {
  id: "14a08176-64a7-4a2d-8a44-581807368394",
  userId: user.id,
  threadId: "24b19287-75b8-4a3e-9c10-691908479405",
  sourceMessageId: "34c29398-86c9-5b4f-ad21-7a2919585046",
  intent: "summarize_progress" as const,
  targetDomain: "general" as const,
  title: "Weekly progress summary",
  reason: "You asked for a recap of recent activity.",
  proposedChanges: {},
  status: "pending" as const,
  validationStatus: "valid" as const,
  validationErrors: [],
  userDecisionAt: null,
  appliedReference: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function createRepositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    findById: async () => pendingProposal,
    listByUserId: async () => [],
    claimPendingForReject: async () => ({
      ...pendingProposal,
      status: "rejected" as const,
      userDecisionAt: new Date(),
    }),
    claimPendingForAccept: async () => ({
      ...pendingProposal,
      status: "accepted" as const,
      userDecisionAt: new Date(),
    }),
    finalizeAcceptedProposal: async (
      _id: string,
      appliedReference: string | null,
    ) => ({
      ...pendingProposal,
      status: "accepted" as const,
      appliedReference,
      userDecisionAt: new Date(),
    }),
    revertAcceptedClaim: async () => pendingProposal,
    markValidation: async () => pendingProposal,
    ...overrides,
  };
}

describe("ProposalsService", () => {
  it("rejects a proposal without applying domain changes", async () => {
    let applyCalled = false;

    const service = new ProposalsService(
      createRepositoryMock() as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {
        validateStoredProposal: () => ({ valid: true, errors: [] }),
      } as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "summary:applied";
        },
      } as never,
    );

    const result = await service.decideProposal(auth, pendingProposal.id, {
      decision: "reject",
    });

    expect(result.status).toBe("rejected");
    expect(applyCalled).toBe(false);
  });

  it("accepts a valid proposal through the apply service", async () => {
    let applyCalled = false;

    const service = new ProposalsService(
      createRepositoryMock() as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {
        validateStoredProposal: () => ({ valid: true, errors: [] }),
      } as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return `summary:${pendingProposal.id}`;
        },
      } as never,
    );

    const result = await service.decideProposal(auth, pendingProposal.id, {
      decision: "accept",
    });

    expect(result.status).toBe("accepted");
    expect(result.appliedReference).toBe(`summary:${pendingProposal.id}`);
    expect(applyCalled).toBe(true);
  });

  it("prevents double accept via pending claim guard", async () => {
    let applyCount = 0;
    let claimCount = 0;

    const service = new ProposalsService(
      createRepositoryMock({
        claimPendingForAccept: async () => {
          claimCount += 1;

          if (claimCount > 1) {
            return null;
          }

          return {
            ...pendingProposal,
            status: "accepted" as const,
            userDecisionAt: new Date(),
          };
        },
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {
        validateStoredProposal: () => ({ valid: true, errors: [] }),
      } as never,
      {
        applyAcceptedProposal: async () => {
          applyCount += 1;
          return `summary:${pendingProposal.id}`;
        },
      } as never,
    );

    await service.decideProposal(auth, pendingProposal.id, { decision: "accept" });

    await expect(
      service.decideProposal(auth, pendingProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyCount).toBe(1);
  });

  it("reverts the accept claim when apply fails", async () => {
    let revertCalled = false;

    const service = new ProposalsService(
      createRepositoryMock({
        revertAcceptedClaim: async () => {
          revertCalled = true;
          return pendingProposal;
        },
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {
        validateStoredProposal: () => ({ valid: true, errors: [] }),
      } as never,
      {
        applyAcceptedProposal: async () => {
          throw new Error("Apply failed.");
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, pendingProposal.id, { decision: "accept" }),
    ).rejects.toThrow("Apply failed.");
    expect(revertCalled).toBe(true);
  });

  it("does not reopen a proposal if finalizing fails after apply succeeds", async () => {
    let revertCalled = false;

    const service = new ProposalsService(
      createRepositoryMock({
        finalizeAcceptedProposal: async () => null,
        revertAcceptedClaim: async () => {
          revertCalled = true;
          return pendingProposal;
        },
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {
        validateStoredProposal: () => ({ valid: true, errors: [] }),
      } as never,
      {
        applyAcceptedProposal: async () => `summary:${pendingProposal.id}`,
      } as never,
    );

    await expect(
      service.decideProposal(auth, pendingProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(revertCalled).toBe(false);
  });

  it("blocks acceptance when validation fails", async () => {
    let applyCalled = false;
    let claimCalled = false;

    const service = new ProposalsService(
      createRepositoryMock({
        claimPendingForAccept: async () => {
          claimCalled = true;
          return pendingProposal;
        },
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {
        validateStoredProposal: () => ({
          valid: false,
          errors: ["proposedChanges: Invalid"],
        }),
      } as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "summary:applied";
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, pendingProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyCalled).toBe(false);
    expect(claimCalled).toBe(false);
  });

  it("throws when deciding a non-pending proposal", async () => {
    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => ({ ...pendingProposal, status: "accepted" }),
        claimPendingForReject: async () => null,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.decideProposal(auth, pendingProposal.id, { decision: "reject" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws when proposal is not owned by the current user", async () => {
    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => null,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getProposal(auth, pendingProposal.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("blocks acceptance when proposal content fails safety checks", async () => {
    let applyCalled = false;
    let claimCalled = false;
    const unsafeProposal = {
      ...pendingProposal,
      title: "Treatment plan",
      reason: "You should take medication for your symptoms.",
    };

    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => unsafeProposal,
        claimPendingForAccept: async () => {
          claimCalled = true;
          return unsafeProposal;
        },
        markValidation: async (
          _id: string,
          status: "invalid" | "valid" | "pending_validation",
          errors: string[],
        ) => ({
          ...unsafeProposal,
          validationStatus: status,
          validationErrors: errors,
        }),
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {
        validateStoredProposal: () => ({ valid: true, errors: [] }),
      } as never,
      {
        applyAcceptedProposal: async () => {
          applyCalled = true;
          return "summary:applied";
        },
      } as never,
    );

    await expect(
      service.decideProposal(auth, pendingProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(applyCalled).toBe(false);
    expect(claimCalled).toBe(false);
  });

  it("throws when deciding a rejected proposal", async () => {
    const service = new ProposalsService(
      createRepositoryMock({
        findById: async () => ({ ...pendingProposal, status: "rejected" }),
        claimPendingForAccept: async () => null,
      }) as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.decideProposal(auth, pendingProposal.id, { decision: "accept" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
