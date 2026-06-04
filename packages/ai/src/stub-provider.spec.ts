import { describe, expect, it } from "vitest";
import type { AgentToolCallResult } from "@health/types";
import { StubCoachAiProvider } from "./stub-provider.js";

describe("StubCoachAiProvider", () => {
  const provider = new StubCoachAiProvider();

  it("returns user-facing coaching replies from generateCoachResponse only", async () => {
    const output = await provider.generateCoachResponse({
      userMessage: "Explain progressive overload.",
      recentMessages: [],
      coachingContext: {},
      agentMetadata: {
        purpose: "general_chat",
        intent: "general",
        depth: "small",
        timeRange: "7d",
        safetyConstraints: ["Do not diagnose."],
      },
    });

    expect(typeof output.reply).toBe("string");
    expect(output.reply.length).toBeGreaterThan(0);
    expect(Array.isArray(output.proposals)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stub provider — activity-log detection (FIX 3)
//
// Covers:
// 1. generateCoachResponse: past-activity message → log_workout_activity with
//    displayContract + trusted workoutCaloriePerHourRate on the proposal.
// 2. generateDomainStep (workout domain): same routing.
// 3. Plan-request messages still yield create_workout_plan (not log_workout_activity).
// ---------------------------------------------------------------------------

describe("StubCoachAiProvider — activity-log vs plan routing (FIX 3)", () => {
  const provider = new StubCoachAiProvider();

  function makeBaseCoachRequest(userMessage: string) {
    return {
      userMessage,
      recentMessages: [] as Array<{ role: "user" | "assistant" | "system"; content: string }>,
      coachingContext: {},
      agentMetadata: {
        purpose: "workout_chat",
        intent: "workout",
        depth: "small",
        timeRange: "7d",
        safetyConstraints: [] as string[],
      },
    };
  }

  function makeDomainStepRequest(userMessage: string) {
    return {
      domain: "workout" as const,
      iteration: 0,
      maxIterations: 3,
      priorToolResults: [] as AgentToolCallResult[],
      userMessage,
      recentMessages: [] as Array<{ role: "user" | "assistant" | "system"; content: string }>,
      coachingContext: {} as Record<string, unknown>,
      allowedTools: [] as Array<"getUserContextSlice" | "getDocumentContext" | "getWeeklyProgressContext">,
      allowedProposalIntents: [] as string[],
      safetyFlags: [] as Array<"fatigue" | "pain" | "sleep_issue" | "stress" | "hunger" | "schedule_conflict" | "health_context">,
      safetyConstraints: [] as string[],
    };
  }

  // ---- generateCoachResponse: volleyball activity log ----

  it("generateCoachResponse: 'I played volleyball for 90 minutes' yields log_workout_activity proposal", async () => {
    const output = await provider.generateCoachResponse(
      makeBaseCoachRequest("I played volleyball for 90 minutes"),
    );

    const proposals = output.proposals ?? [];
    expect(proposals.length).toBeGreaterThan(0);

    const logProposal = proposals.find(
      (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "log_workout_activity",
    );
    expect(logProposal).toBeDefined();
  });

  it("generateCoachResponse: log_workout_activity proposal has a displayContract", async () => {
    const output = await provider.generateCoachResponse(
      makeBaseCoachRequest("I played volleyball for 90 minutes"),
    );

    const proposals = output.proposals ?? [];
    const logProposal = proposals.find(
      (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "log_workout_activity",
    ) as Record<string, unknown> | undefined;

    expect(logProposal).toBeDefined();
    const proposedChanges = (logProposal?.proposedChanges ?? {}) as Record<string, unknown>;
    expect(proposedChanges["displayContract"]).toBeDefined();

    const dc = proposedChanges["displayContract"] as Record<string, unknown>;
    expect(Array.isArray(dc["fields"])).toBe(true);
    expect(Array.isArray(dc["derived"])).toBe(true);

    // Must have an editable durationMinutes slider field
    const fields = dc["fields"] as Array<Record<string, unknown>>;
    const durationField = fields.find((f) => f["key"] === "durationMinutes");
    expect(durationField).toBeDefined();
    expect(durationField?.["editable"]).toBe(true);

    // ratePerHour must be a readonly (non-editable) field
    const rateField = fields.find((f) => f["key"] === "ratePerHour");
    expect(rateField).toBeDefined();
    expect(rateField?.["editable"]).toBe(false);
  });

  it("generateCoachResponse: log_workout_activity proposal carries trusted workoutCaloriePerHourRate=300", async () => {
    const output = await provider.generateCoachResponse(
      makeBaseCoachRequest("I played volleyball for 90 minutes"),
    );

    const proposals = output.proposals ?? [];
    const logProposal = proposals.find(
      (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "log_workout_activity",
    ) as Record<string, unknown> | undefined;

    expect(logProposal).toBeDefined();
    const proposedChanges = (logProposal?.proposedChanges ?? {}) as Record<string, unknown>;

    // ratePerHour must be the trusted stub rate (300).
    expect(proposedChanges["ratePerHour"]).toBe(300);
    // estimatedCalories = round(300 * 90 / 60) = 450
    expect(proposedChanges["estimatedCalories"]).toBe(450);
    // durationMinutes parsed from "90 minutes"
    expect(proposedChanges["durationMinutes"]).toBe(90);
  });

  it("generateCoachResponse: 'went for a 60 minute run' yields log_workout_activity", async () => {
    const output = await provider.generateCoachResponse(
      makeBaseCoachRequest("went for a 60 minute run"),
    );

    const proposals = output.proposals ?? [];
    const logProposal = proposals.find(
      (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "log_workout_activity",
    );
    expect(logProposal).toBeDefined();
  });

  it("generateCoachResponse: 'went for a 60 minute run' — estimatedCalories recomputed correctly", async () => {
    const output = await provider.generateCoachResponse(
      makeBaseCoachRequest("went for a 60 minute run"),
    );

    const proposals = output.proposals ?? [];
    const logProposal = proposals.find(
      (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "log_workout_activity",
    ) as Record<string, unknown> | undefined;

    const proposedChanges = (logProposal?.proposedChanges ?? {}) as Record<string, unknown>;
    // round(300 * 60 / 60) = 300
    expect(proposedChanges["estimatedCalories"]).toBe(300);
    expect(proposedChanges["ratePerHour"]).toBe(300);
  });

  // ---- generateCoachResponse: plan request still yields create_workout_plan ----

  it("generateCoachResponse: 'make me a workout plan' yields create_workout_plan, NOT log_workout_activity", async () => {
    const output = await provider.generateCoachResponse(
      makeBaseCoachRequest("make me a workout plan"),
    );

    const proposals = output.proposals ?? [];
    const logProposal = proposals.find(
      (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "log_workout_activity",
    );
    const planProposal = proposals.find(
      (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "create_workout_plan",
    );

    expect(logProposal).toBeUndefined();
    expect(planProposal).toBeDefined();
  });

  it("generateCoachResponse: 'create a workout routine' yields create_workout_plan", async () => {
    const output = await provider.generateCoachResponse(
      makeBaseCoachRequest("create a workout routine"),
    );

    const proposals = output.proposals ?? [];
    const logProposal = proposals.find(
      (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "log_workout_activity",
    );

    expect(logProposal).toBeUndefined();
  });

  // ---- generateDomainStep (workout domain): activity log routing ----

  it("generateDomainStep workout: 'I played volleyball for 90 minutes' yields log_workout_activity", async () => {
    const output = await provider.generateDomainStep(
      makeDomainStepRequest("I played volleyball for 90 minutes"),
    );

    expect(output.kind).toBe("domain_answer");
    if (output.kind !== "domain_answer") return;

    const proposals = output.candidateProposals ?? [];
    const logProposal = proposals.find(
      (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "log_workout_activity",
    );
    expect(logProposal).toBeDefined();
  });

  it("generateDomainStep workout: activity log proposal carries trusted workoutCaloriePerHourRate=300 on domain output", async () => {
    const output = await provider.generateDomainStep(
      makeDomainStepRequest("I played volleyball for 90 minutes"),
    );

    expect(output.kind).toBe("domain_answer");
    if (output.kind !== "domain_answer") return;

    // workoutCaloriePerHourRate must be set so ActionResolver can stamp the trusted rate.
    expect(output.workoutCaloriePerHourRate).toBe(300);
    expect(typeof output.workoutCalorieEstimate).toBe("number");
    expect((output.workoutCalorieEstimate ?? 0)).toBeGreaterThan(0);
  });

  it("generateDomainStep workout: 'make me a workout plan' yields create_workout_plan, not log_workout_activity", async () => {
    const output = await provider.generateDomainStep(
      makeDomainStepRequest("make me a workout plan"),
    );

    expect(output.kind).toBe("domain_answer");
    if (output.kind !== "domain_answer") return;

    const proposals = output.candidateProposals ?? [];
    const logProposal = proposals.find(
      (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "log_workout_activity",
    );
    const planProposal = proposals.find(
      (p) => typeof p === "object" && p !== null && "intent" in p && p.intent === "create_workout_plan",
    );

    expect(logProposal).toBeUndefined();
    expect(planProposal).toBeDefined();
  });
});
