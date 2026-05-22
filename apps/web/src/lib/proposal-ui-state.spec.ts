import { describe, expect, it } from "vitest";
import type { AiProposal } from "@health/types";
import {
  canAcceptProposal,
  canDecideProposal,
  getAcceptDisabledReason,
  getProposalDomainLabel,
  getProposalDomainPillClass,
  getProposalDomainRoute,
  getProposalIntentLabel,
  getProposalStatusBadgeTone,
  getProposalStatusLabel,
  mergeProposalsById,
} from "./proposal-ui-state.js";

describe("proposal UI state", () => {
  it("allows reject for any pending proposal", () => {
    expect(
      canDecideProposal({
        status: "pending",
        validationStatus: "valid",
      }),
    ).toBe(true);

    expect(
      canDecideProposal({
        status: "pending",
        validationStatus: "invalid",
      }),
    ).toBe(true);

    expect(
      canDecideProposal({
        status: "accepted",
        validationStatus: "valid",
      }),
    ).toBe(false);
  });

  it("deduplicates merged proposals by id with local precedence", () => {
    const server = [
      { id: "a", title: "Server A" },
      { id: "b", title: "Server B" },
    ] as AiProposal[];
    const local = [
      { id: "a", title: "Local A" },
      { id: "c", title: "Local C" },
    ] as AiProposal[];

    const merged = mergeProposalsById(server, local);

    expect(merged).toHaveLength(3);
    expect(merged.find((proposal) => proposal.id === "a")?.title).toBe("Local A");
    expect(merged.find((proposal) => proposal.id === "b")?.title).toBe("Server B");
    expect(merged.find((proposal) => proposal.id === "c")?.title).toBe("Local C");
  });

  it("explains why invalid pending proposals cannot be accepted", () => {
    expect(
      getAcceptDisabledReason({
        status: "pending",
        validationStatus: "invalid",
        validationErrors: ["Calories must be within a safe range."],
      }),
    ).toContain("validation issues");

    expect(
      getAcceptDisabledReason({
        status: "pending",
        validationStatus: "valid",
        validationErrors: [],
      }),
    ).toBeNull();
  });

  it("allows accept only for pending valid proposals", () => {
    expect(
      canAcceptProposal({
        status: "pending",
        validationStatus: "valid",
      }),
    ).toBe(true);

    expect(
      canAcceptProposal({
        status: "pending",
        validationStatus: "invalid",
      }),
    ).toBe(false);

    expect(
      canAcceptProposal({
        status: "rejected",
        validationStatus: "valid",
      }),
    ).toBe(false);
  });

  it("maps proposal domains to user-facing labels and routes", () => {
    expect(getProposalDomainLabel("workout")).toBe("Workout");
    expect(getProposalDomainLabel("goal")).toBe("Goal");
    expect(getProposalDomainLabel("recipe")).toBe("Recipe");
    expect(getProposalDomainRoute("nutrition")).toBe("/nutrition");
    expect(getProposalDomainRoute("recipe")).toBe("/recipes");
    expect(getProposalDomainRoute("general")).toBeNull();
    expect(getProposalStatusLabel("pending")).toBe("Pending review");
    expect(getProposalDomainPillClass("profile")).toBe("proposal-domain-pill--profile");
    expect(getProposalDomainPillClass("recipe")).toBe("proposal-domain-pill--recipe");
  });

  it("labels progress-derived workout adaptation intents", () => {
    expect(getProposalIntentLabel("adapt_workout_plan_from_progress")).toContain(
      "Progress-based",
    );
    expect(getProposalIntentLabel("adjust_nutrition_plan")).toBeNull();
  });

  it("maps lifecycle states to inline copy and badge tones", () => {
    expect(getProposalStatusLabel("accepted")).toBe("Accepted");
    expect(getProposalStatusLabel("rejected")).toBe("Declined");
    expect(getProposalStatusLabel("superseded")).toBe("Superseded");

    expect(getProposalStatusBadgeTone("pending")).toBe("pending");
    expect(getProposalStatusBadgeTone("accepted")).toBe("success");
    expect(getProposalStatusBadgeTone("rejected")).toBe("error");
    expect(getProposalStatusBadgeTone("superseded")).toBe("neutral");
  });
});
