import { describe, expect, it } from "vitest";
import { buildPromptChipLinkAriaLabel } from "./prompt-chip-ui-state.js";

describe("prompt chip UI state", () => {
  it("uses navigation copy for plain chat routes without query prefill", () => {
    expect(
      buildPromptChipLinkAriaLabel({
        href: "/chat",
        promptLabel: "Give me a cross-domain weekly review of my progress.",
        children: "Cross-domain review",
      }),
    ).toBe("Open Chat — Cross-domain review");
  });

  it("uses discuss copy when chat href includes a prefill query", () => {
    expect(
      buildPromptChipLinkAriaLabel({
        href: "/chat?message=Give%20me%20a%20review",
        promptLabel: "Give me a cross-domain weekly review of my progress.",
        children: "Cross-domain review",
      }),
    ).toBe("Open Chat and discuss: Give me a cross-domain weekly review of my progress.");
  });

  it("falls back to prompt label for plain chat when children are not plain text", () => {
    expect(
      buildPromptChipLinkAriaLabel({
        href: "/chat",
        promptLabel: "Help me set a wellness goal",
      }),
    ).toBe("Open Chat — Help me set a wellness goal");
  });
});
