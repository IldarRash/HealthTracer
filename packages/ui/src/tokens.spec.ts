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
  it("uses teal coach primary aligned with visual direction", () => {
    expect(tokens.color.coach[600]).toBe("#0d9488");
    expect(tokens.color.coach[700]).toBe("#0f766e");
    expect(tokens.color.coach[100]).toBe("#ccfbf1");
  });

  it("maps focus ring to coach accent for accessibility", () => {
    expect(tokens.focus.color).toBe(tokens.color.coach[400]);
    expect(tokens.focus.width).toBe("2px");
    expect(tokens.focus.offset).toBe("2px");
  });
});

describe("shell and surface tokens", () => {
  it("defines dark nav shell surfaces", () => {
    expect(tokens.color.surface.nav).toBe("#121212");
    expect(tokens.color.surface.navHover).toBe("#1e1e1e");
    expect(tokens.color.surface.navActive).toBe("#262626");
    expect(tokens.color.surface.heroDark).toBe("#1a1a1a");
  });

  it("reserves light content tokens for structured screens", () => {
    expect(tokens.color.surface.content).toBe("#f7f7f5");
    expect(tokens.color.surface.contentElevated).toBe("#ffffff");
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
    expect(proposalDomainTone.workout.text).toBe(tokens.color.coach[700]);
    expect(proposalDomainTone.nutrition.text).toBe(tokens.color.status.success.text);
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
    expect(tokenVar("coach600")).toBe("var(--color-coach-600)");
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
