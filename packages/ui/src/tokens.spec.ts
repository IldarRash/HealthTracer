import { describe, expect, it } from "vitest";
import { privacyStatusLabel, privacyStatusTone } from "./tokens.js";

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
