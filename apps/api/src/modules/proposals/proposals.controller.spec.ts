import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { ProposalsController } from "./proposals.controller.js";

const authA = { clerkUserId: "clerk-user-a", email: "a@example.com", displayName: null };
const authB = { clerkUserId: "clerk-user-b", email: "b@example.com", displayName: null };

function createServiceMock() {
  return {
    listProposals: vi.fn(),
    getProposal: vi.fn(),
    decideProposal: vi.fn(),
    requestProposalModification: vi.fn(),
  };
}

describe("ProposalsController", () => {
  describe("decideProposal — body validation", () => {
    it("rejects a body with an unknown decision value (400)", () => {
      const service = createServiceMock();
      const controller = new ProposalsController(service as never);

      expect(() =>
        controller.decideProposal(authA as never, "prop-1", { decision: "approve" }),
      ).toThrow(BadRequestException);
      expect(service.decideProposal).not.toHaveBeenCalled();
    });

    it("rejects a 'modify' decision without modificationFeedback", () => {
      const service = createServiceMock();
      const controller = new ProposalsController(service as never);

      expect(() =>
        controller.decideProposal(authA as never, "prop-1", { decision: "modify" }),
      ).toThrow(BadRequestException);
      expect(service.requestProposalModification).not.toHaveBeenCalled();
    });

    it("rejects a 'modify' decision with empty modificationFeedback", () => {
      const service = createServiceMock();
      const controller = new ProposalsController(service as never);

      expect(() =>
        controller.decideProposal(authA as never, "prop-1", {
          decision: "modify",
          modificationFeedback: "   ",
        }),
      ).toThrow(BadRequestException);
    });

    it("rejects proposedChanges on a non-accept decision", () => {
      const service = createServiceMock();
      const controller = new ProposalsController(service as never);

      expect(() =>
        controller.decideProposal(authA as never, "prop-1", {
          decision: "reject",
          proposedChanges: { something: true },
        }),
      ).toThrow(BadRequestException);
    });

    it("accepts an 'accept' decision and delegates to decideProposal", () => {
      const service = createServiceMock();
      service.decideProposal.mockResolvedValue({ id: "prop-1", status: "accepted" });
      const controller = new ProposalsController(service as never);

      controller.decideProposal(authA as never, "prop-1", { decision: "accept" });

      expect(service.decideProposal).toHaveBeenCalledWith(
        authA,
        "prop-1",
        expect.objectContaining({ decision: "accept" }),
      );
    });

    it("accepts a 'reject' decision and delegates to decideProposal", () => {
      const service = createServiceMock();
      service.decideProposal.mockResolvedValue({ id: "prop-1", status: "rejected" });
      const controller = new ProposalsController(service as never);

      controller.decideProposal(authA as never, "prop-1", { decision: "reject" });

      expect(service.decideProposal).toHaveBeenCalledWith(
        authA,
        "prop-1",
        expect.objectContaining({ decision: "reject" }),
      );
    });

    it("accepts a 'modify' decision with non-empty feedback and delegates to requestProposalModification", () => {
      const service = createServiceMock();
      service.requestProposalModification.mockResolvedValue({ proposal: {} });
      const controller = new ProposalsController(service as never);

      controller.decideProposal(authA as never, "prop-2", {
        decision: "modify",
        modificationFeedback: "Please reduce the intensity",
      });

      expect(service.requestProposalModification).toHaveBeenCalledWith(
        authA,
        "prop-2",
        "Please reduce the intensity",
      );
    });
  });

  describe("decideProposal — ownership (IDOR seam)", () => {
    it("passes caller auth A, not caller auth B, to the service", () => {
      const service = createServiceMock();
      service.decideProposal.mockResolvedValue({ id: "prop-3" });
      const controller = new ProposalsController(service as never);

      controller.decideProposal(authA as never, "prop-3", { decision: "accept" });

      const [calledAuth] = service.decideProposal.mock.calls[0]!;
      expect(calledAuth).toEqual(authA);
      expect(calledAuth).not.toEqual(authB);
    });

    it("passes proposalId param to the service (scopes to the correct proposal)", () => {
      const service = createServiceMock();
      service.decideProposal.mockResolvedValue({ id: "specific-prop" });
      const controller = new ProposalsController(service as never);

      controller.decideProposal(authA as never, "specific-prop", { decision: "reject" });

      expect(service.decideProposal).toHaveBeenCalledWith(
        authA,
        "specific-prop",
        expect.any(Object),
      );
    });
  });

  describe("getProposal — auth forwarded", () => {
    it("delegates to service with caller auth and proposalId", () => {
      const service = createServiceMock();
      service.getProposal.mockResolvedValue({ id: "prop-99" });
      const controller = new ProposalsController(service as never);

      controller.getProposal(authA as never, "prop-99");

      expect(service.getProposal).toHaveBeenCalledWith(authA, "prop-99");
    });
  });
});
