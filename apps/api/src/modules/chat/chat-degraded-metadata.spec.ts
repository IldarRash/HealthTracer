/**
 * Regression spec: assistant message metadata carries turnDegraded when AiService reports degraded.
 * Pure function coverage — no DB/NestJS; uses the same minimal fixture pattern as chat.service.spec.ts.
 */
import { describe, expect, it } from "vitest";
import { parseChatMessageDegradedTurn } from "@health/types";

// ---------------------------------------------------------------------------
// Minimal: just verify the contract at the metadata level.
// We test the actual chat.service.ts insertion via source-contract assertions.
// ---------------------------------------------------------------------------

describe("chat degraded metadata contract", () => {
  it("parseChatMessageDegradedTurn reads turnDegraded from message metadata correctly", () => {
    // Simulates the exact shape chat.service.ts writes to createMessage metadata
    const metadata = {
      parseErrors: [],
      replySafetyErrors: ["unsafe reply"],
      agent: { safety: { status: "reply_blocked", blockedReasons: ["unsafe reply"], constraintsApplied: [] } },
      turnDegraded: { degraded: true, reason: "reply_blocked" },
    };

    const result = parseChatMessageDegradedTurn(metadata);
    expect(result).toEqual({ degraded: true, reason: "reply_blocked" });
  });

  it("returns null for a clean (non-degraded) assistant message metadata", () => {
    const metadata = {
      parseErrors: [],
      replySafetyErrors: [],
      agent: { safety: { status: "passed", blockedReasons: [], constraintsApplied: [] } },
    };

    const result = parseChatMessageDegradedTurn(metadata);
    expect(result).toBeNull();
  });

  it("handles parse_failed degraded reason", () => {
    const metadata = {
      turnDegraded: { degraded: true, reason: "parse_failed" },
    };
    const result = parseChatMessageDegradedTurn(metadata);
    expect(result?.reason).toBe("parse_failed");
  });

  it("handles provider_error degraded reason", () => {
    const metadata = {
      turnDegraded: { degraded: true, reason: "provider_error" },
    };
    const result = parseChatMessageDegradedTurn(metadata);
    expect(result?.reason).toBe("provider_error");
  });
});

// ---------------------------------------------------------------------------
// Source contract: verify that chat.service.ts spreads turnDegraded into metadata
// ---------------------------------------------------------------------------
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const chatServiceSource = readFileSync(join(dir, "chat.service.ts"), "utf8").replace(/\r\n/g, "\n");

describe("chat.service.ts degraded metadata insertion", () => {
  it("spreads turnDegraded into the assistant message metadata", () => {
    expect(chatServiceSource).toContain("turnDegraded");
    expect(chatServiceSource).toContain("generated.degraded");
    expect(chatServiceSource).toContain("degraded: true");
    expect(chatServiceSource).toContain("generated.degraded.reason");
  });

  it("conditionally spreads turnDegraded only when degraded is present", () => {
    // The spread must be guarded by a conditional (ternary or if)
    expect(chatServiceSource).toMatch(/generated\.degraded\s*\?/);
  });
});
