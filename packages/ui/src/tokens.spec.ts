import { describe, expect, it } from "vitest";
import {
  cssVar,
  privacyStatusLabel,
  privacyStatusTone,
  proposalDomainLabel,
  proposalDomainTone,
  proposalStatusTone,
  tokenVar,
  tokens,
} from "./tokens.js";

describe("coach accent tokens", () => {
  it("uses green coach primary aligned with visual direction", () => {
    expect(tokens.color.coach[600]).toBe("#19c37d");
    expect(tokens.color.coach[700]).toBe("#15a76b");
    expect(tokens.color.coach[100]).toBe("rgba(25,195,125,0.16)");
  });

  it("maps focus ring to coach accent for accessibility", () => {
    expect(tokens.focus.color).toBe(tokens.color.coach[500]);
    expect(tokens.focus.width).toBe("2px");
    expect(tokens.focus.offset).toBe("2px");
  });
});

describe("shell and surface tokens", () => {
  it("defines dark nav shell surfaces", () => {
    expect(tokens.color.surface.nav).toBe("#0e1113");
    expect(tokens.color.surface.navHover).toBe("#1e1e1e");
    expect(tokens.color.surface.navActive).toBe("#262626");
    expect(tokens.color.surface.heroDark).toBe("#131618");
  });

  it("reserves light content tokens for structured screens", () => {
    expect(tokens.color.surface.content).toBe("#f9f9f8");
    expect(tokens.color.surface.contentElevated).toBe("#ffffff");
  });

  it("defines premium overview card tokens for structured canvas", () => {
    expect(tokens.overview.hero.surface).toBe(tokens.color.surface.heroDark);
    expect(tokens.overview.card.surface).toBe(tokens.color.surface.contentElevated);
    expect(tokens.overview.trend.fill).toBe(tokens.color.coach[500]);
  });
});

describe("layout and metric tokens", () => {
  it("matches chat and content width constraints from visual direction", () => {
    expect(tokens.layout.chatMax).toBe("48rem");
    expect(tokens.layout.contentMax).toBe("72rem");
    expect(tokens.layout.navHeight).toBe("3.5rem");
  });

  it("meets minimum touch target sizing for mobile nav", () => {
    expect(tokens.layout.touchTargetMin).toBe("2.75rem");
  });

  it("defines metric-forward typography scale", () => {
    expect(tokens.typography.metricHero.sizeMin).toBe("2.5rem");
    expect(tokens.typography.metricHero.sizeMax).toBe("3rem");
    expect(tokens.typography.chat.size).toBe("0.9375rem");
  });
});

describe("status and proposal tokens", () => {
  it("maps proposal lifecycle states to status tones", () => {
    expect(proposalStatusTone.pending).toBe("pending");
    expect(proposalStatusTone.accepted).toBe("success");
    expect(proposalStatusTone.rejected).toBe("error");
  });

  it("assigns distinct domain pill tones without clinical language", () => {
    expect(proposalDomainTone.workout.text).toBe(tokens.color.metric.blue);
    expect(proposalDomainTone.nutrition.text).toBe(tokens.color.metric.green);
    expect(Object.values(proposalDomainLabel)).not.toContain("targetDomain");
  });

  it("uses wellness-oriented human domain labels", () => {
    expect(proposalDomainLabel.workout).toBe("Workout");
    expect(proposalDomainLabel.nutrition).toBe("Nutrition");
    expect(proposalDomainLabel.profile).toBe("Profile");
  });
});

describe("css variable mapping", () => {
  it("exposes coach and focus vars for web stylesheet parity", () => {
    expect(cssVar.coach600).toBe("--color-coach-600");
    expect(cssVar.focusOutline).toBe("--focus-outline");
    expect(cssVar.surfaceContent).toBe("--color-surface-content");
    expect(cssVar.accentPrimary).toBe("--color-accent-primary");
    expect(tokenVar("coach600")).toBe("var(--color-coach-600)");
  });

  it("exposes chat bubble and metadata vars for transcript polish", () => {
    expect(cssVar.chatBubbleAssistantBg).toBe("--color-chat-bubble-assistant-bg");
    expect(cssVar.chatMetadataCrisisBorder).toBe("--color-chat-metadata-crisis-border");
    expect(tokens.chat.bubble.user.bg).toBe("#f0fbf6");
    expect(tokens.chat.metadata.crisis.border).toBe("#fca5a5");
  });
});

describe("privacy status tokens", () => {
  it("keeps consent and revocation states visually distinct", () => {
    expect(privacyStatusTone.consent_required).toBe("pending");
    expect(privacyStatusTone.active).toBe("success");
    expect(privacyStatusTone.revoked).toBe("error");
  });

  it("uses non-medical status labels for device sync states", () => {
    expect(privacyStatusLabel.consent_required).toBe("Consent needed");
    expect(privacyStatusLabel.active).toBe("Sync active");
    expect(privacyStatusLabel.revoked).toBe("Access revoked");
  });
});
