import { describe, expect, it } from "vitest";
import {
  defaultRefreshHintsForDirectPathKind,
  directChatPathCandidateSchema,
  directChatPathMetadataSchema,
  directChatPathOutcomeSchema,
} from "./direct-chat-path.js";
import { detectDirectChatPathCandidate } from "./direct-chat-path-matcher.js";

describe("direct chat path contracts", () => {
  it("parses candidate, outcome, and metadata schemas", () => {
    const candidate = directChatPathCandidateSchema.parse({
      kind: "today_summary_read",
      confidence: 0.95,
      routingMethod: "rule_based",
    });

    const outcome = directChatPathOutcomeSchema.parse({
      kind: "mark_today_workout_done",
      status: "executed",
      refreshHints: ["today", "dashboard", "longevity"],
    });

    const metadata = directChatPathMetadataSchema.parse({
      candidate,
      outcome,
    });

    expect(metadata.candidate?.kind).toBe("today_summary_read");
    expect(outcome.refreshHints).toContain("dashboard");
  });

  it("returns refresh hints only for executed outcomes", () => {
    expect(
      defaultRefreshHintsForDirectPathKind("today_summary_read", "executed"),
    ).toEqual(["today"]);
    expect(
      defaultRefreshHintsForDirectPathKind("mark_today_workout_done", "executed"),
    ).toEqual(["today", "dashboard", "longevity"]);
    expect(
      defaultRefreshHintsForDirectPathKind("mark_today_workout_done", "clarification_required"),
    ).toEqual([]);
  });
});

describe("detectDirectChatPathCandidate", () => {
  it("detects explicit today summary read asks", () => {
    expect(detectDirectChatPathCandidate("What is today?")).toEqual({
      kind: "today_summary_read",
      confidence: 0.95,
      routingMethod: "rule_based",
    });
    expect(detectDirectChatPathCandidate("What's my plan for today?")).toEqual({
      kind: "today_summary_read",
      confidence: 0.95,
      routingMethod: "rule_based",
    });
    expect(detectDirectChatPathCandidate("Show me today's summary")).toEqual({
      kind: "today_summary_read",
      confidence: 0.95,
      routingMethod: "rule_based",
    });
    expect(detectDirectChatPathCandidate("План на сегодня?")).toEqual({
      kind: "today_summary_read",
      confidence: 0.95,
      routingMethod: "rule_based",
    });
  });

  it("detects explicit mark today workout done commands", () => {
    expect(detectDirectChatPathCandidate("Mark today's workout done")).toEqual({
      kind: "mark_today_workout_done",
      confidence: 0.95,
      routingMethod: "rule_based",
    });
    expect(detectDirectChatPathCandidate("Mark my workout as complete today")).toEqual({
      kind: "mark_today_workout_done",
      confidence: 0.95,
      routingMethod: "rule_based",
    });
    expect(detectDirectChatPathCandidate("Complete my workout today")).toEqual({
      kind: "mark_today_workout_done",
      confidence: 0.95,
      routingMethod: "rule_based",
    });
    expect(detectDirectChatPathCandidate("Check off today's training")).toEqual({
      kind: "mark_today_workout_done",
      confidence: 0.95,
      routingMethod: "rule_based",
    });
  });

  it("does not treat advice or plan-change asks as direct paths", () => {
    expect(detectDirectChatPathCandidate("Should I train today after poor sleep?")).toBeNull();
    expect(detectDirectChatPathCandidate("Can I skip today's workout?")).toBeNull();
    expect(detectDirectChatPathCandidate("Make my workout easier today")).toBeNull();
    expect(detectDirectChatPathCandidate("Adapt my workout plan for today")).toBeNull();
    expect(detectDirectChatPathCandidate("What should I eat today?")).toBeNull();
  });

  it("does not treat ambiguous workout mentions as direct action", () => {
    expect(detectDirectChatPathCandidate("I finished training today")).toBeNull();
    expect(detectDirectChatPathCandidate("Today's workout was hard")).toBeNull();
    expect(detectDirectChatPathCandidate("Log my lunch")).toBeNull();
  });

  it("returns null when attachments are present", () => {
    expect(
      detectDirectChatPathCandidate("What is today?", { hasAttachments: true }),
    ).toBeNull();
    expect(
      detectDirectChatPathCandidate("Mark today's workout done", { hasAttachments: true }),
    ).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(detectDirectChatPathCandidate("   ")).toBeNull();
  });
});
