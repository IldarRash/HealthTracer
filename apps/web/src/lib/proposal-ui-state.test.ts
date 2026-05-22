import { describe, expect, it } from "vitest";
import { canAcceptProposal, canDecideProposal } from "./proposal-ui-state";

describe("proposal UI state", () => {
  it("allows rejecting invalid pending proposals", () => {
    const proposal = {
      status: "pending",
      validationStatus: "invalid",
    } as const;

    expect(canDecideProposal(proposal)).toBe(true);
    expect(canAcceptProposal(proposal)).toBe(false);
  });

  it("prevents decisions after a proposal is accepted", () => {
    const proposal = {
      status: "accepted",
      validationStatus: "valid",
    } as const;

    expect(canDecideProposal(proposal)).toBe(false);
    expect(canAcceptProposal(proposal)).toBe(false);
  });
});
