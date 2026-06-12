/**
 * AiService — degraded flag mapping spec.
 *
 * Tests that AiService correctly maps agentMetadata.safety.status → generated.degraded
 * without touching agent-orchestrator internals.
 *
 * Contract (see packages/types/src/chat-turn.ts): degraded (reply present) and
 * turnError (reply absent) are disjoint. When the orchestrator sets turnError
 * (decision_failed / reply_blocked), no degraded quality marker is derived —
 * only the reply-present statuses (parse_failed, provider_error) map to degraded.
 */
import { describe, expect, it, vi } from "vitest";
import { AiService } from "./ai.service.js";
import type { AgentOrchestratorService } from "./agent-orchestrator.service.js";

// Minimal stub orchestrator that returns whatever agentMetadata we inject.
function makeOrchestratorStub(
  safetyStatus: string,
  turnError?: { reason: "decision_failed" | "reply_blocked" },
) {
  return {
    orchestrateCoachTurn: vi.fn().mockResolvedValue({
      output: { reply: "safe fallback reply", selectedAction: null, proposals: [] },
      parseErrors: [],
      replySafetyErrors: safetyStatus === "reply_blocked" ? ["blocked"] : [],
      consentRequired: undefined,
      ...(turnError !== undefined ? { turnError } : {}),
      agentMetadata: {
        safety: { status: safetyStatus, blockedReasons: [], constraintsApplied: [] },
      },
    }),
    getProviderMode: vi.fn().mockReturnValue("stub"),
  } as unknown as AgentOrchestratorService;
}

const baseInput = {
  auth: { clerkUserId: "test_user", email: "test@example.com", displayName: "Tester" },
  userMessage: "Test message",
  recentMessages: [] as const,
};

describe("AiService degraded flag mapping", () => {
  it("sets degraded.reason=parse_failed when safety.status=parse_failed", async () => {
    const service = new AiService(makeOrchestratorStub("parse_failed"));
    const result = await service.generateCoachResponse(baseInput);
    expect(result.degraded).toEqual({ reason: "parse_failed" });
    expect(result.turnError).toBeUndefined();
  });

  it("sets degraded.reason=provider_error when safety.status=provider_error (no turnError)", async () => {
    const service = new AiService(makeOrchestratorStub("provider_error"));
    const result = await service.generateCoachResponse(baseInput);
    expect(result.degraded).toEqual({ reason: "provider_error" });
  });

  it("does NOT set degraded when safety.status=passed", async () => {
    const service = new AiService(makeOrchestratorStub("passed"));
    const result = await service.generateCoachResponse(baseInput);
    expect(result.degraded).toBeUndefined();
  });

  it("does NOT set degraded when turnError=reply_blocked is present — surfaces turnError instead", async () => {
    const service = new AiService(
      makeOrchestratorStub("reply_blocked", { reason: "reply_blocked" }),
    );
    const result = await service.generateCoachResponse(baseInput);
    expect(result.degraded).toBeUndefined();
    expect(result.turnError).toEqual({ reason: "reply_blocked" });
  });

  it("does NOT set degraded when turnError=decision_failed is present — surfaces turnError instead", async () => {
    const service = new AiService(
      makeOrchestratorStub("provider_error", { reason: "decision_failed" }),
    );
    const result = await service.generateCoachResponse(baseInput);
    expect(result.degraded).toBeUndefined();
    expect(result.turnError).toEqual({ reason: "decision_failed" });
  });

  it("preserves output and parseErrors alongside the degraded flag", async () => {
    const service = new AiService(makeOrchestratorStub("parse_failed"));
    const result = await service.generateCoachResponse(baseInput);
    expect(result.output.reply).toBe("safe fallback reply");
    expect(result.degraded).toEqual({ reason: "parse_failed" });
    expect(result.parseErrors).toEqual([]);
  });
});
