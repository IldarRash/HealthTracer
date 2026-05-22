import { describe, expect, it, vi } from "vitest";
import { ProposalsRepository } from "./proposals.repository.js";

const proposalId = "14a08176-64a7-4a2d-8a44-581807368394";
const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const appliedReference = "workout_revision:880099c6-3b5f-4383-8246-97b72bf61818";

const pendingRow = {
  id: proposalId,
  userId,
  status: "pending",
  appliedReference: null,
  validationStatus: "valid",
  validationErrors: [],
};

describe("ProposalsRepository", () => {
  describe("acceptPendingProposal", () => {
    it("persists appliedReference when finalize throws an arbitrary DB error after apply", async () => {
      let applyCount = 0;
      let completePendingCalls = 0;
      const acceptedRow = {
        ...pendingRow,
        status: "accepted",
        appliedReference,
        userDecisionAt: new Date(),
      };

      const db = {
        transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            select: vi.fn(() => ({
              from: vi.fn(() => ({
                where: vi.fn(() => ({
                  for: vi.fn(async () => [pendingRow]),
                })),
              })),
            })),
            update: vi.fn(() => ({
              set: vi.fn(() => ({
                where: vi.fn(() => ({
                  returning: vi.fn(async () => {
                    throw new Error("connection terminated");
                  }),
                })),
              })),
            })),
          };

          return callback(tx);
        }),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn(async () => {
                completePendingCalls += 1;
                return [acceptedRow];
              }),
            })),
          })),
        })),
      };

      const repository = new ProposalsRepository(db as never);

      const result = await repository.acceptPendingProposal(
        proposalId,
        userId,
        async () => {
          applyCount += 1;
          return appliedReference;
        },
      );

      expect(applyCount).toBe(1);
      expect(completePendingCalls).toBe(1);
      expect(result?.status).toBe("accepted");
      expect(result?.appliedReference).toBe(appliedReference);
    });

    it("rethrows when finalize fails and recovery cannot persist appliedReference", async () => {
      let applyCount = 0;

      const db = {
        transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            select: vi.fn(() => ({
              from: vi.fn(() => ({
                where: vi.fn(() => ({
                  for: vi.fn(async () => [pendingRow]),
                })),
              })),
            })),
            update: vi.fn(() => ({
              set: vi.fn(() => ({
                where: vi.fn(() => ({
                  returning: vi.fn(async () => {
                    throw new Error("connection terminated");
                  }),
                })),
              })),
            })),
          };

          return callback(tx);
        }),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn(async () => []),
            })),
          })),
        })),
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => []),
            })),
          })),
        })),
      };

      const repository = new ProposalsRepository(db as never);

      await expect(
        repository.acceptPendingProposal(proposalId, userId, async () => {
          applyCount += 1;
          return appliedReference;
        }),
      ).rejects.toThrow("connection terminated");
      expect(applyCount).toBe(1);
    });
  });

  describe("recoverAppliedReferenceAfterAcceptanceFailure", () => {
    it("returns null when appliedReference is missing", async () => {
      const repository = new ProposalsRepository({} as never);

      await expect(
        repository.recoverAppliedReferenceAfterAcceptanceFailure(proposalId, userId, null),
      ).resolves.toBeNull();
    });
  });
});
