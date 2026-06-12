/**
 * workout-plan-day-details.render.spec.ts
 *
 * Source-level render assertions (repo convention for component specs) plus
 * pure ui-state assertions for the invalid-proposal card behavior:
 *  - expandable day rows: aria-expanded button + chevron + hidden panel
 *  - generic card swaps flat day lines for the structured day rows
 *  - invalid proposals (any intent, incl. create_workout_plan) route to the
 *    generic card BEFORE the intent dispatch and keep Apply disabled with a
 *    reason while Reject/Modify stay available
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AiProposal } from "@health/types";
import {
  canAcceptProposal,
  canDecideProposal,
  getAcceptDisabledReason,
  shouldShowInvalidValidationNotice,
} from "../../lib/proposal-ui-state";

function readSource(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

const proposalsDir = dirname(fileURLToPath(import.meta.url));
const dayDetailsSource = readSource(join(proposalsDir, "workout-plan-day-details.tsx"));
const genericCardSource = readSource(join(proposalsDir, "inline-proposal-card-generic.tsx"));
const routerCardSource = readSource(join(proposalsDir, "inline-proposal-card.tsx"));
const stylesSource = readSource(join(proposalsDir, "../../../app/styles.css"));

describe("WorkoutPlanDayDetails — expandable day rows", () => {
  it("renders a keyboard-accessible disclosure button per day", () => {
    expect(dayDetailsSource).toContain('type="button"');
    expect(dayDetailsSource).toContain("aria-expanded={expanded}");
    expect(dayDetailsSource).toContain("aria-controls={panelId}");
    expect(dayDetailsSource).toContain("useId");
    expect(dayDetailsSource).toContain("useState(false)");
  });

  it("shows a chevron that tracks the expanded state", () => {
    expect(dayDetailsSource).toContain('expanded ? "chevD" : "chevR"');
  });

  it("hides the exercise panel until expanded", () => {
    expect(dayDetailsSource).toContain("hidden={!expanded}");
  });

  it("uses the day summary line as the row header and formats prescriptions", () => {
    expect(dayDetailsSource).toContain("{day.label}");
    expect(dayDetailsSource).toContain("formatWorkoutExercisePrescription");
    expect(dayDetailsSource).toContain("${exercise.name} — ${prescription}");
  });

  it("reuses the shared detail-line-list primitive and has styles defined", () => {
    expect(dayDetailsSource).toContain("detail-line-list");
    expect(stylesSource).toContain(".workout-plan-day__toggle");
    expect(stylesSource).toContain(".workout-plan-day-list");
  });

  it("renders nothing for an empty day list", () => {
    expect(dayDetailsSource).toContain("days.length === 0");
  });
});

describe("Generic card wires structured workout days into the change summary", () => {
  it("swaps the flat day lines for WorkoutPlanDayDetails when workoutDays is present", () => {
    expect(genericCardSource).toContain("summary.workoutDays");
    expect(genericCardSource).toContain("<WorkoutPlanDayDetails days={workoutDays} />");
    // Before/after semantics preserved: the non-day lines still render as strings.
    expect(genericCardSource).toContain("flatAfterLines");
    expect(genericCardSource).toContain("<strong>Before</strong>");
    expect(genericCardSource).toContain("<strong>After</strong>");
  });
});

describe("Unvalidated proposals route to the generic card before intent dispatch", () => {
  it("checks isValidatedProposal before any specialized intent card", () => {
    const invalidGuardIndex = routerCardSource.indexOf(
      "!isValidatedProposal(props.proposal)",
    );
    const wellbeingIndex = routerCardSource.indexOf('"capture_wellbeing_checkin"');
    const nutritionIndex = routerCardSource.indexOf('"log_nutrition_incident"');
    const bodyIndex = routerCardSource.indexOf('"save_body_analysis"');
    const recipeIndex = routerCardSource.indexOf('"recommend_recipes"');

    expect(invalidGuardIndex).toBeGreaterThan(-1);
    expect(invalidGuardIndex).toBeLessThan(wellbeingIndex);
    expect(invalidGuardIndex).toBeLessThan(nutritionIndex);
    expect(invalidGuardIndex).toBeLessThan(bodyIndex);
    expect(invalidGuardIndex).toBeLessThan(recipeIndex);
  });
});

describe("Invalid create_workout_plan proposal — card behavior gates", () => {
  const invalidWorkoutProposal = {
    id: "14a08176-64a7-4a2d-8a44-581807368394",
    userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
    threadId: "24b19287-75b8-4a3e-9c10-691908479405",
    sourceMessageId: null,
    intent: "create_workout_plan",
    targetDomain: "workout",
    title: "Week 2 athletic system",
    reason: "From your uploaded plan.",
    proposedChanges: { days: "not-a-valid-shape" },
    status: "pending",
    validationStatus: "invalid",
    validationErrors: ["proposedChanges: payload failed validation"],
    userDecisionAt: null,
    appliedReference: null,
    createdAt: "2026-06-12T12:00:00.000Z",
    updatedAt: "2026-06-12T12:00:00.000Z",
  } as unknown as AiProposal;

  it("shows the localized invalid notice instead of raw Zod errors", () => {
    expect(shouldShowInvalidValidationNotice(invalidWorkoutProposal)).toBe(true);
  });

  it("disables Apply with an explanatory reason", () => {
    expect(canAcceptProposal(invalidWorkoutProposal)).toBe(false);
    expect(getAcceptDisabledReason(invalidWorkoutProposal)).toContain(
      "cannot be applied",
    );
  });

  it("keeps Reject and Modify available while pending", () => {
    expect(canDecideProposal(invalidWorkoutProposal)).toBe(true);
  });
});
