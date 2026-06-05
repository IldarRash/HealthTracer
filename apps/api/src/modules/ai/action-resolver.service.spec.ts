import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT_BUDGET_POLICY } from "@health/types";
import type { FinalDecisionOutput } from "@health/types";
import {
  ActionResolverService,
  type ActionResolverFinalDecisionInput,
} from "./action-resolver.service.js";
import { PLAIN_REPLY_ACTION_VARIANT_ID } from "./action-variant-catalog.service.js";
import type { DomainFanoutEntry } from "./system-planner.service.js";

const WORKOUT_PROPOSAL = {
  intent: "adapt_workout_plan" as const,
  targetDomain: "workout" as const,
  title: "Reduce today's load",
  reason: "Recovery signals are low.",
  proposedChanges: {
    title: "Strength base",
    summary: "Lighter session today.",
    // B5/B6: weekday required, object exercises only.
    days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
    notes: [],
  },
};

const NUTRITION_PROPOSAL = {
  intent: "log_nutrition_incident" as const,
  targetDomain: "nutrition" as const,
  title: "Log post-workout meal",
  reason: "Nutrition logging is outside this workout turn.",
  proposedChanges: {
    incidentDateTime: "2026-05-26T18:00:00.000Z",
    items: [{ name: "Protein shake", quantity: "1 serving", calories: 220 }],
    estimatedCalories: 220,
    estimatedMacros: { proteinGrams: 30, carbsGrams: 10, fatGrams: 4 },
    confidence: "medium" as const,
    provenance: { source: "text_estimate" as const, providerId: "chat_trigger" },
    imageRefs: [],
  },
};


// ---------------------------------------------------------------------------
// resolveFinalDecisionOutput (Phase 5 — decision-maker path)
// ---------------------------------------------------------------------------

describe("ActionResolverService.resolveFinalDecisionOutput", () => {
  const service = new ActionResolverService();

  function makeDomainEntry(
    domain: DomainFanoutEntry["domain"],
    allowedProposalIntents: string[],
  ): DomainFanoutEntry {
    return {
      domain,
      capabilityId: domain === "workout" ? "adjust_workout" : "adjust_nutrition",
      allowedTools: [],
      allowedProposalIntents,
      contextBudget: DEFAULT_CONTEXT_BUDGET_POLICY,
      executorMode: "single_llm",
    };
  }

  function resolveDecision(
    finalDecision: Partial<FinalDecisionOutput>,
    selectedDomains: DomainFanoutEntry[],
  ) {
    const input: ActionResolverFinalDecisionInput = {
      finalDecision: {
        reply: "Coach reply.",
        selectedAction: null,
        proposals: [],
        consentRequired: false,
        ...finalDecision,
      },
      selectedDomains,
    };

    return service.resolveFinalDecisionOutput(input);
  }

  describe("plain reply path", () => {
    it("returns empty proposals when selectedAction is null", () => {
      const result = resolveDecision(
        { selectedAction: null, proposals: [WORKOUT_PROPOSAL] },
        [makeDomainEntry("workout", ["adapt_workout_plan"])],
      );
      expect(result.proposals).toHaveLength(0);
    });

    it("returns empty proposals when selectedAction is plain_reply", () => {
      const result = resolveDecision(
        { selectedAction: PLAIN_REPLY_ACTION_VARIANT_ID, proposals: [WORKOUT_PROPOSAL] },
        [makeDomainEntry("workout", ["adapt_workout_plan"])],
      );
      expect(result.proposals).toHaveLength(0);
      expect(result.consentRequired).toBe(false);
    });

    it("preserves the reply from the decision-maker", () => {
      const result = resolveDecision(
        { reply: "Custom reply from decision-maker.", selectedAction: null },
        [makeDomainEntry("workout", ["adapt_workout_plan"])],
      );
      expect(result.reply).toBe("Custom reply from decision-maker.");
    });
  });

  describe("proposal action path", () => {
    it("passes allowed proposals through unchanged", () => {
      const result = resolveDecision(
        {
          selectedAction: "adapt_workout_plan",
          proposals: [WORKOUT_PROPOSAL],
        },
        [makeDomainEntry("workout", ["adapt_workout_plan"])],
      );
      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0]?.intent).toBe("adapt_workout_plan");
    });

    it("filters proposals outside the union allowlist", () => {
      const result = resolveDecision(
        {
          selectedAction: "adapt_workout_plan",
          proposals: [WORKOUT_PROPOSAL, NUTRITION_PROPOSAL],
        },
        [makeDomainEntry("workout", ["adapt_workout_plan"])],
      );
      // Only workout proposal passes; nutrition is out of the workout domain allowlist.
      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0]?.intent).toBe("adapt_workout_plan");
    });

    it("builds the union from all selected domains' allowedProposalIntents", () => {
      const result = resolveDecision(
        {
          selectedAction: "adapt_workout_plan",
          proposals: [WORKOUT_PROPOSAL, NUTRITION_PROPOSAL],
        },
        [
          makeDomainEntry("workout", ["adapt_workout_plan"]),
          makeDomainEntry("nutrition", ["log_nutrition_incident"]),
        ],
      );
      // Both proposals are in the union allowlist (workout + nutrition domains).
      expect(result.proposals).toHaveLength(2);
    });

    it("returns no proposals when selectedDomains is empty", () => {
      const result = resolveDecision(
        {
          selectedAction: "adapt_workout_plan",
          proposals: [WORKOUT_PROPOSAL],
        },
        [],
      );
      expect(result.proposals).toHaveLength(0);
    });
  });


  describe("mutation safety", () => {
    it("does not mutate the input proposals array", () => {
      const proposals = [WORKOUT_PROPOSAL, NUTRITION_PROPOSAL];
      const decision: FinalDecisionOutput = {
        reply: "Reply.",
        selectedAction: "adapt_workout_plan",
        proposals,
        consentRequired: false,
      };
      service.resolveFinalDecisionOutput({
        finalDecision: decision,
        selectedDomains: [makeDomainEntry("workout", ["adapt_workout_plan"])],
      });
      expect(decision.proposals).toHaveLength(2);
    });
  });

  describe("ActionResolver is mutation-free (no DB/persist calls)", () => {
    it("resolveFinalDecisionOutput returns a plain object with no side effects", () => {
      // ActionResolver must be a pure resolver — no DB calls, no repository calls,
      // no persisting. This test validates that the service is instantiated with no
      // dependencies and that its resolve methods return synchronously.
      const resolver = new ActionResolverService();

      // Verify the service has no injectable dependencies that could cause DB access.
      // The constructor takes no arguments — mutation-free by construction.
      expect(typeof resolver.resolveFinalDecisionOutput).toBe("function");

      const result = resolver.resolveFinalDecisionOutput({
        finalDecision: {
          reply: "A plain reply.",
          selectedAction: PLAIN_REPLY_ACTION_VARIANT_ID,
          proposals: [],
          consentRequired: false,
        },
        selectedDomains: [makeDomainEntry("workout", [])],
      });

      // plain_reply produces no proposals — the result is a plain value object
      // with no DB interaction possible (no async, no side effects).
      expect(result.consentRequired).toBe(false);
      expect(result.proposals).toHaveLength(0);
      expect(result.reply).toBe("A plain reply.");
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 6b — workout calorie estimate stamping
// ---------------------------------------------------------------------------

describe("ActionResolverService.resolveFinalDecisionOutput — workout calorie estimate (Phase 6b)", () => {
  const service = new ActionResolverService();

  function makeDomainEntry(
    domain: DomainFanoutEntry["domain"],
    allowedProposalIntents: string[],
  ): DomainFanoutEntry {
    return {
      domain,
      capabilityId: domain === "workout" ? "adjust_workout" : "adjust_nutrition",
      allowedTools: [],
      allowedProposalIntents,
      contextBudget: DEFAULT_CONTEXT_BUDGET_POLICY,
      executorMode: "single_llm",
    };
  }

  const WORKOUT_PLAN_PROPOSAL = {
    intent: "adapt_workout_plan" as const,
    targetDomain: "workout" as const,
    title: "Reduce today's load",
    reason: "Recovery signals are low.",
    proposedChanges: {
      title: "Strength base",
      summary: "Lighter session today.",
      days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
      notes: [],
    },
  };

  it("stamps estimatedSessionCalorieBurn and provenance=workout_llm onto workout proposals when workoutCalorieEstimate is provided", () => {
    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Here is your adjusted plan.",
        selectedAction: "adapt_workout_plan",
        proposals: [WORKOUT_PLAN_PROPOSAL],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["adapt_workout_plan"])],
      workoutCalorieEstimate: 280,
    });

    expect(result.proposals).toHaveLength(1);
    const stamped = result.proposals[0]?.proposedChanges as Record<string, unknown>;
    expect(stamped["estimatedSessionCalorieBurn"]).toBe(280);
    expect(stamped["calorieEstimateProvenance"]).toBe("workout_llm");
  });

  it("does not stamp calorie fields when workoutCalorieEstimate is absent", () => {
    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Here is your adjusted plan.",
        selectedAction: "adapt_workout_plan",
        proposals: [WORKOUT_PLAN_PROPOSAL],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["adapt_workout_plan"])],
      // No workoutCalorieEstimate passed
    });

    expect(result.proposals).toHaveLength(1);
    const changes = result.proposals[0]?.proposedChanges as Record<string, unknown>;
    expect(changes["estimatedSessionCalorieBurn"]).toBeUndefined();
    expect(changes["calorieEstimateProvenance"]).toBeUndefined();
  });

  it("does not stamp calorie fields on non-workout proposals (nutrition proposal)", () => {
    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Here is nutrition info.",
        selectedAction: "adapt_workout_plan",
        proposals: [WORKOUT_PLAN_PROPOSAL, NUTRITION_PROPOSAL],
        consentRequired: false,
      },
      selectedDomains: [
        makeDomainEntry("workout", ["adapt_workout_plan"]),
        makeDomainEntry("nutrition", ["log_nutrition_incident"]),
      ],
      workoutCalorieEstimate: 350,
    });

    expect(result.proposals).toHaveLength(2);
    // Workout proposal gets stamped
    const workoutChanges = result.proposals[0]?.proposedChanges as Record<string, unknown>;
    expect(workoutChanges["estimatedSessionCalorieBurn"]).toBe(350);
    expect(workoutChanges["calorieEstimateProvenance"]).toBe("workout_llm");
    // Nutrition proposal is NOT touched
    const nutritionChanges = result.proposals[1]?.proposedChanges as Record<string, unknown>;
    expect(nutritionChanges["estimatedSessionCalorieBurn"]).toBeUndefined();
    expect(nutritionChanges["calorieEstimateProvenance"]).toBeUndefined();
  });

  it("stamps calorie estimate onto create_workout_plan proposals", () => {
    const createProposal = {
      intent: "create_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "New strength plan",
      reason: "Starting fresh.",
      proposedChanges: {
        title: "New strength base",
        summary: "Fresh three day plan.",
        days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
        notes: [],
      },
    };

    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Here is a new plan.",
        selectedAction: "create_workout_plan",
        proposals: [createProposal],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["create_workout_plan"])],
      workoutCalorieEstimate: 420,
    });

    const stamped = result.proposals[0]?.proposedChanges as Record<string, unknown>;
    expect(stamped["estimatedSessionCalorieBurn"]).toBe(420);
    expect(stamped["calorieEstimateProvenance"]).toBe("workout_llm");
  });

  it("does not mutate the original proposal proposedChanges object", () => {
    const originalChanges = {
      title: "Strength base",
      summary: "Lighter session today.",
      days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
      notes: [],
    };
    const proposal = {
      ...WORKOUT_PLAN_PROPOSAL,
      proposedChanges: originalChanges,
    };

    service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Reply.",
        selectedAction: "adapt_workout_plan",
        proposals: [proposal],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["adapt_workout_plan"])],
      workoutCalorieEstimate: 200,
    });

    // Original object must be untouched.
    expect((originalChanges as Record<string, unknown>)["estimatedSessionCalorieBurn"]).toBeUndefined();
  });

  it("plain_reply path never stamps calorie even when workoutCalorieEstimate is provided", () => {
    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Just a reply.",
        selectedAction: PLAIN_REPLY_ACTION_VARIANT_ID,
        proposals: [WORKOUT_PLAN_PROPOSAL],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["adapt_workout_plan"])],
      workoutCalorieEstimate: 280,
    });

    // plain_reply produces no proposals at all — no stamping occurs.
    expect(result.proposals).toHaveLength(0);
  });

  it("plain_reply path does not stamp workout calorie (no proposals produced)", () => {
    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Just a reply.",
        selectedAction: PLAIN_REPLY_ACTION_VARIANT_ID,
        proposals: [],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", [])],
      workoutCalorieEstimate: 280,
    });

    // plain_reply produces no proposals at all — no stamping occurs.
    expect(result.consentRequired).toBe(false);
    expect(result.proposals).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Finding 1: adapt_workout_plan_from_progress must stamp nested .plan
  // -----------------------------------------------------------------------

  it("stamps calorie estimate onto adapt_workout_plan_from_progress nested .plan", () => {
    // The proposedChanges for this intent is the AdaptWorkoutPlanFromProgressChanges
    // wrapper { plan, sourceSummaryId, ... }. The calorie fields must live on .plan,
    // NOT at the top level of the wrapper, because the apply path reads .plan.
    const fromProgressProposal = {
      intent: "adapt_workout_plan_from_progress" as const,
      targetDomain: "workout" as const,
      title: "Progress-based adaptation",
      reason: "Weekly progress indicates load should decrease.",
      proposedChanges: {
        plan: {
          title: "Adapted plan",
          summary: "Reduced load based on progress.",
          days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
          notes: [],
        },
        sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        sourceTrendObservationIds: [],
      },
    };

    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Here is your adapted plan.",
        selectedAction: "adapt_workout_plan_from_progress",
        proposals: [fromProgressProposal],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["adapt_workout_plan_from_progress"])],
      workoutCalorieEstimate: 310,
    });

    expect(result.proposals).toHaveLength(1);
    const changes = result.proposals[0]?.proposedChanges as Record<string, unknown>;

    // Calorie fields must be on the nested .plan, not the wrapper top level.
    const nestedPlan = changes["plan"] as Record<string, unknown>;
    expect(nestedPlan["estimatedSessionCalorieBurn"]).toBe(310);
    expect(nestedPlan["calorieEstimateProvenance"]).toBe("workout_llm");

    // The wrapper itself must not carry calorie fields (they don't belong there).
    expect(changes["estimatedSessionCalorieBurn"]).toBeUndefined();
    expect(changes["calorieEstimateProvenance"]).toBeUndefined();

    // Other wrapper fields must be preserved.
    expect(changes["sourceSummaryId"]).toBe("14a08176-64a7-4a2d-8a44-581807368394");
  });

  it("does not stamp calorie onto adapt_workout_plan_from_progress when estimate is absent", () => {
    const fromProgressProposal = {
      intent: "adapt_workout_plan_from_progress" as const,
      targetDomain: "workout" as const,
      title: "Progress-based adaptation",
      reason: "Weekly progress.",
      proposedChanges: {
        plan: {
          title: "Adapted plan",
          summary: "Reduced load.",
          days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
          notes: [],
        },
        sourceTrendObservationIds: [],
      },
    };

    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Adapted.",
        selectedAction: "adapt_workout_plan_from_progress",
        proposals: [fromProgressProposal],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["adapt_workout_plan_from_progress"])],
      // No workoutCalorieEstimate
    });

    expect(result.proposals).toHaveLength(1);
    const nestedPlan = (result.proposals[0]?.proposedChanges as Record<string, unknown>)[
      "plan"
    ] as Record<string, unknown>;
    expect(nestedPlan["estimatedSessionCalorieBurn"]).toBeUndefined();
    expect(nestedPlan["calorieEstimateProvenance"]).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Finding 2: fabricated calorie fields are always scrubbed, even without an
  // incoming workoutCalorieEstimate
  // -----------------------------------------------------------------------

  it("scrubs fabricated calorie fields injected by the decision-maker into flat workout proposals", () => {
    // If the decision-maker (or a non-workout LLM) places calorie fields directly into
    // proposedChanges, ActionResolver must strip them unconditionally before returning.
    // This ensures the source-exclusivity floor is enforced in code.
    const fabricatedProposal = {
      intent: "adapt_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Fabricated calorie plan",
      reason: "Test.",
      proposedChanges: {
        title: "Strength base",
        summary: "Lighter session.",
        days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
        notes: [],
        estimatedSessionCalorieBurn: 9999,         // Injected by decision-maker — must be stripped
        calorieEstimateProvenance: "workout_llm",  // Injected by decision-maker — must be stripped
      } as Record<string, unknown>,
    };

    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Here is your plan.",
        selectedAction: "adapt_workout_plan",
        proposals: [fabricatedProposal],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["adapt_workout_plan"])],
      // No trusted workoutCalorieEstimate — so the scrubbed fields must NOT be re-stamped.
    });

    expect(result.proposals).toHaveLength(1);
    const changes = result.proposals[0]?.proposedChanges as Record<string, unknown>;
    // Fabricated calorie fields must be gone.
    expect(changes["estimatedSessionCalorieBurn"]).toBeUndefined();
    expect(changes["calorieEstimateProvenance"]).toBeUndefined();
  });

  it("scrubs fabricated calorie fields injected by the decision-maker into adapt_workout_plan_from_progress nested plan", () => {
    const fabricatedFromProgressProposal = {
      intent: "adapt_workout_plan_from_progress" as const,
      targetDomain: "workout" as const,
      title: "Fabricated from-progress plan",
      reason: "Test.",
      proposedChanges: {
        plan: {
          title: "Adapted plan",
          summary: "Lighter.",
          days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
          notes: [],
          estimatedSessionCalorieBurn: 8888,        // Injected — must be stripped
          calorieEstimateProvenance: "workout_llm", // Injected — must be stripped
        },
        sourceTrendObservationIds: [],
      } as Record<string, unknown>,
    };

    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Adapted.",
        selectedAction: "adapt_workout_plan_from_progress",
        proposals: [fabricatedFromProgressProposal],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["adapt_workout_plan_from_progress"])],
      // No trusted workoutCalorieEstimate — fabricated fields must be removed.
    });

    expect(result.proposals).toHaveLength(1);
    const nestedPlan = (result.proposals[0]?.proposedChanges as Record<string, unknown>)[
      "plan"
    ] as Record<string, unknown>;
    expect(nestedPlan["estimatedSessionCalorieBurn"]).toBeUndefined();
    expect(nestedPlan["calorieEstimateProvenance"]).toBeUndefined();
  });

  it("trusted estimate replaces (not appends to) previously scrubbed fabricated value", () => {
    // Even if the decision-maker injected a value, the trusted workout LLM estimate
    // must be the one that appears in the output — not both values.
    const fabricatedProposal = {
      intent: "adapt_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Fabricated + trusted",
      reason: "Test.",
      proposedChanges: {
        title: "Strength base",
        summary: "Session.",
        days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
        notes: [],
        estimatedSessionCalorieBurn: 5555,         // Wrong fabricated value
        calorieEstimateProvenance: "workout_llm",
      } as Record<string, unknown>,
    };

    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Plan updated.",
        selectedAction: "adapt_workout_plan",
        proposals: [fabricatedProposal],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["adapt_workout_plan"])],
      workoutCalorieEstimate: 400, // Trusted value from workout domain LLM
    });

    expect(result.proposals).toHaveLength(1);
    const changes = result.proposals[0]?.proposedChanges as Record<string, unknown>;
    // Must be the trusted value, not the fabricated 5555.
    expect(changes["estimatedSessionCalorieBurn"]).toBe(400);
    expect(changes["calorieEstimateProvenance"]).toBe("workout_llm");
  });
});

// ---------------------------------------------------------------------------
// Phase 6c — workout caloriePerHourRate stamping (trusted source exclusivity)
// ---------------------------------------------------------------------------

describe("ActionResolverService.resolveFinalDecisionOutput — caloriePerHourRate stamping (Phase 6c)", () => {
  const service = new ActionResolverService();

  function makeDomainEntry(
    domain: DomainFanoutEntry["domain"],
    allowedProposalIntents: string[],
  ): DomainFanoutEntry {
    return {
      domain,
      capabilityId: domain === "workout" ? "adjust_workout" : "adjust_nutrition",
      allowedTools: [],
      allowedProposalIntents,
      contextBudget: DEFAULT_CONTEXT_BUDGET_POLICY,
      executorMode: "single_llm",
    };
  }

  const FLAT_WORKOUT_PROPOSAL = {
    intent: "adapt_workout_plan" as const,
    targetDomain: "workout" as const,
    title: "Adapted plan",
    reason: "Load reduced.",
    proposedChanges: {
      title: "Strength base",
      summary: "Lighter session.",
      days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
      notes: [],
    },
  };

  it("stamps caloriePerHourRate from workoutCaloriePerHourRate onto flat workout proposals", () => {
    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Here is your adjusted plan.",
        selectedAction: "adapt_workout_plan",
        proposals: [FLAT_WORKOUT_PROPOSAL],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["adapt_workout_plan"])],
      workoutCalorieEstimate: 300,
      workoutCaloriePerHourRate: 280,
    });

    expect(result.proposals).toHaveLength(1);
    const changes = result.proposals[0]?.proposedChanges as Record<string, unknown>;
    expect(changes["caloriePerHourRate"]).toBe(280);
    expect(changes["estimatedSessionCalorieBurn"]).toBe(300);
    expect(changes["calorieEstimateProvenance"]).toBe("workout_llm");
  });

  it("scrubs a fabricated caloriePerHourRate when no trusted rate is provided", () => {
    // The decision-maker LLM must never set caloriePerHourRate — it must be scrubbed.
    // Use a value within the schema-valid range (1–5000) so that safeParse succeeds
    // and the scrub logic is actually tested (not masked by a parse failure).
    const fabricatedProposal = {
      intent: "adapt_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Plan with fabricated rate",
      reason: "Test.",
      proposedChanges: {
        title: "Strength base",
        summary: "Session.",
        days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
        notes: [],
        caloriePerHourRate: 450, // Valid-range fabricated value — must be scrubbed when no trusted rate
      } as Record<string, unknown>,
    };

    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Plan.",
        selectedAction: "adapt_workout_plan",
        proposals: [fabricatedProposal],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["adapt_workout_plan"])],
      // No workoutCaloriePerHourRate — fabricated value must be removed
    });

    expect(result.proposals).toHaveLength(1);
    const changes = result.proposals[0]?.proposedChanges as Record<string, unknown>;
    expect(changes["caloriePerHourRate"]).toBeUndefined();
  });

  it("stamps caloriePerHourRate onto adapt_workout_plan_from_progress nested .plan", () => {
    const fromProgressProposal = {
      intent: "adapt_workout_plan_from_progress" as const,
      targetDomain: "workout" as const,
      title: "Progress-based adaptation",
      reason: "Weekly progress.",
      proposedChanges: {
        plan: {
          title: "Adapted plan",
          summary: "Reduced load.",
          days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
          notes: [],
        },
        sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        sourceTrendObservationIds: [],
      },
    };

    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Adapted.",
        selectedAction: "adapt_workout_plan_from_progress",
        proposals: [fromProgressProposal],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["adapt_workout_plan_from_progress"])],
      workoutCalorieEstimate: 310,
      workoutCaloriePerHourRate: 280,
    });

    expect(result.proposals).toHaveLength(1);
    const changes = result.proposals[0]?.proposedChanges as Record<string, unknown>;
    const nestedPlan = changes["plan"] as Record<string, unknown>;

    // caloriePerHourRate must be on nested .plan
    expect(nestedPlan["caloriePerHourRate"]).toBe(280);
    expect(nestedPlan["estimatedSessionCalorieBurn"]).toBe(310);
    expect(nestedPlan["calorieEstimateProvenance"]).toBe("workout_llm");

    // Wrapper must not carry calorie fields
    expect(changes["caloriePerHourRate"]).toBeUndefined();
  });

  it("scrubs a fabricated caloriePerHourRate from nested .plan when no trusted rate is provided", () => {
    const fabricatedFromProgress = {
      intent: "adapt_workout_plan_from_progress" as const,
      targetDomain: "workout" as const,
      title: "Fabricated from-progress",
      reason: "Test.",
      proposedChanges: {
        plan: {
          title: "Adapted plan",
          summary: "Lighter.",
          days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
          notes: [],
          caloriePerHourRate: 350, // Valid-range fabricated value — must be scrubbed when no trusted rate
        },
        sourceTrendObservationIds: [],
      } as Record<string, unknown>,
    };

    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Adapted.",
        selectedAction: "adapt_workout_plan_from_progress",
        proposals: [fabricatedFromProgress],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["adapt_workout_plan_from_progress"])],
      // No workoutCaloriePerHourRate — fabricated value must be removed
    });

    expect(result.proposals).toHaveLength(1);
    const nestedPlan = (result.proposals[0]?.proposedChanges as Record<string, unknown>)[
      "plan"
    ] as Record<string, unknown>;
    expect(nestedPlan["caloriePerHourRate"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// BLOCKER 2 — log_workout_activity ratePerHour / estimatedCalories scrub+stamp
// ---------------------------------------------------------------------------

describe("ActionResolverService.resolveFinalDecisionOutput — log_workout_activity calorie scrub+stamp", () => {
  const service = new ActionResolverService();

  function makeDomainEntry(
    domain: DomainFanoutEntry["domain"],
    allowedProposalIntents: string[],
  ): DomainFanoutEntry {
    return {
      domain,
      capabilityId: domain === "workout" ? "adjust_workout" : "adjust_nutrition",
      allowedTools: [],
      allowedProposalIntents,
      contextBudget: DEFAULT_CONTEXT_BUDGET_POLICY,
      executorMode: "single_llm",
    };
  }

  const VALID_LOG_WORKOUT_BASE = {
    activityType: "volleyball",
    title: "Volleyball session",
    durationMinutes: 90,
    performedAt: "2026-06-04T16:00:00.000Z",
  };

  it("stamps ratePerHour and estimatedCalories from trusted workout domain LLM values", () => {
    const proposal = {
      intent: "log_workout_activity" as const,
      targetDomain: "workout" as const,
      title: "Volleyball 90 min",
      reason: "User reported activity.",
      proposedChanges: {
        ...VALID_LOG_WORKOUT_BASE,
        estimatedCalories: 300,   // will be replaced by trusted estimate
        ratePerHour: 200,         // will be replaced by trusted rate
      },
    };

    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Logged!",
        selectedAction: "log_workout_activity",
        proposals: [proposal],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["log_workout_activity"])],
      workoutCalorieEstimate: 450,
      workoutCaloriePerHourRate: 300,
    });

    expect(result.proposals).toHaveLength(1);
    const changes = result.proposals[0]?.proposedChanges as Record<string, unknown>;
    expect(changes["ratePerHour"]).toBe(300);
    expect(changes["estimatedCalories"]).toBe(450);
  });

  it("scrubs fabricated ratePerHour from decision-maker when no trusted rate is available", () => {
    // Use a schema-valid ratePerHour value (≤3000) so safeParse succeeds and the
    // scrub logic is actually exercised (not masked by a parse failure).
    const proposal = {
      intent: "log_workout_activity" as const,
      targetDomain: "workout" as const,
      title: "Volleyball 90 min",
      reason: "User reported activity.",
      proposedChanges: {
        ...VALID_LOG_WORKOUT_BASE,
        estimatedCalories: 300,
        ratePerHour: 450, // Valid-range fabricated rate — must be scrubbed when no trusted rate
      },
    };

    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Logged!",
        selectedAction: "log_workout_activity",
        proposals: [proposal],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["log_workout_activity"])],
      // No trusted rate or estimate — fabricated ratePerHour must be stripped;
      // the payload .refine() will reject the proposal downstream (fail-closed).
    });

    expect(result.proposals).toHaveLength(1);
    const changes = result.proposals[0]?.proposedChanges as Record<string, unknown>;
    expect(changes["ratePerHour"]).toBeUndefined();
    // estimatedCalories also scrubbed since no trusted estimate was provided
    expect(changes["estimatedCalories"]).toBeUndefined();
  });

  it("scrubs fabricated ratePerHour but re-stamps trusted estimatedCalories when only estimate is provided", () => {
    const proposal = {
      intent: "log_workout_activity" as const,
      targetDomain: "workout" as const,
      title: "Volleyball 90 min",
      reason: "User reported activity.",
      proposedChanges: {
        ...VALID_LOG_WORKOUT_BASE,
        estimatedCalories: 100,
        ratePerHour: 450, // Valid-range fabricated rate — must be scrubbed
      },
    };

    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Logged!",
        selectedAction: "log_workout_activity",
        proposals: [proposal],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["log_workout_activity"])],
      workoutCalorieEstimate: 405, // Only trusted estimate, no rate
    });

    expect(result.proposals).toHaveLength(1);
    const changes = result.proposals[0]?.proposedChanges as Record<string, unknown>;
    // Fabricated ratePerHour scrubbed; trusted estimate stamped
    expect(changes["ratePerHour"]).toBeUndefined();
    expect(changes["estimatedCalories"]).toBe(405);
  });

  it("stamps only ratePerHour when only the trusted rate is provided (no estimate)", () => {
    const proposal = {
      intent: "log_workout_activity" as const,
      targetDomain: "workout" as const,
      title: "Volleyball 90 min",
      reason: "User reported activity.",
      proposedChanges: {
        ...VALID_LOG_WORKOUT_BASE,
        estimatedCalories: 100, // will be scrubbed; no trusted estimate to re-stamp
        ratePerHour: 450,       // will be scrubbed; trusted rate re-stamped
      },
    };

    const result = service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Logged!",
        selectedAction: "log_workout_activity",
        proposals: [proposal],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["log_workout_activity"])],
      workoutCaloriePerHourRate: 280, // Only trusted rate, no estimate
    });

    expect(result.proposals).toHaveLength(1);
    const changes = result.proposals[0]?.proposedChanges as Record<string, unknown>;
    expect(changes["ratePerHour"]).toBe(280);
    expect(changes["estimatedCalories"]).toBeUndefined();
  });

  it("does not mutate the original proposedChanges object for log_workout_activity", () => {
    const originalChanges = {
      ...VALID_LOG_WORKOUT_BASE,
      estimatedCalories: 200,
      ratePerHour: 150,
    };
    const proposal = {
      intent: "log_workout_activity" as const,
      targetDomain: "workout" as const,
      title: "Volleyball 90 min",
      reason: "User reported activity.",
      proposedChanges: originalChanges,
    };

    service.resolveFinalDecisionOutput({
      finalDecision: {
        reply: "Logged!",
        selectedAction: "log_workout_activity",
        proposals: [proposal],
        consentRequired: false,
      },
      selectedDomains: [makeDomainEntry("workout", ["log_workout_activity"])],
      workoutCalorieEstimate: 500,
      workoutCaloriePerHourRate: 333,
    });

    // Original object must be untouched
    expect((originalChanges as Record<string, unknown>)["ratePerHour"]).toBe(150);
    expect((originalChanges as Record<string, unknown>)["estimatedCalories"]).toBe(200);
  });
});
