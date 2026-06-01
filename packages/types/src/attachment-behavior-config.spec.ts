import { describe, expect, it } from "vitest";
import {
  applyAttachmentBehaviorSafetyFloors,
  buildDefaultAttachmentBehaviorConfig,
  normalizeAttachmentBehaviorConfig,
  resolveLoadedAttachmentBehaviorConfig,
  safeParseAttachmentBehaviorConfig,
  validateAttachmentBehaviorConfig,
  type AttachmentBehaviorConfig,
} from "./attachment-behavior-config.js";
import { buildDefaultAiBehaviorConfig } from "./ai-behavior-config.js";

describe("attachment behavior config", () => {
  it("builds defaults that validate", () => {
    const defaults = buildDefaultAttachmentBehaviorConfig();

    expect(validateAttachmentBehaviorConfig(defaults)).toEqual([]);
    expect(defaults.version).toBe(1);
    expect(defaults.turnStages.order).toEqual([
      "validate_refs",
      "link_to_message",
      "apply_upload_disposition",
    ]);
  });

  it("keeps default attachment routing parity for legacy ai-behavior schema only", () => {
    const attachmentDefaults = buildDefaultAttachmentBehaviorConfig();
    const aiBehaviorDefaults = buildDefaultAiBehaviorConfig();

    expect(attachmentDefaults.routing).toEqual(aiBehaviorDefaults.attachmentRouting);
  });

  it("rejects invalid config shapes", () => {
    const parsed = safeParseAttachmentBehaviorConfig({ version: 2 });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.errors.length).toBeGreaterThan(0);
    }
  });

  it("falls back to defaults when attachment config file is missing", () => {
    const defaults = buildDefaultAttachmentBehaviorConfig();
    const loaded = resolveLoadedAttachmentBehaviorConfig({ defaults });

    expect(loaded.source).toBe("defaults");
    expect(loaded.config).toEqual(defaults);
    expect(loaded.errors).toEqual([]);
    expect(loaded.warnings).toContain(
      "Attachment behavior config file missing; using built-in defaults.",
    );
  });

  it("falls back to defaults when file config is invalid", () => {
    const defaults = buildDefaultAttachmentBehaviorConfig();
    const loaded = resolveLoadedAttachmentBehaviorConfig({
      fileValue: { version: 2 },
      defaults,
    });

    expect(loaded.source).toBe("defaults");
    expect(loaded.config).toEqual(defaults);
    expect(loaded.errors.length).toBeGreaterThan(0);
    expect(loaded.warnings).toContain("Invalid attachment behavior config; using built-in defaults.");
  });

  it("normalizes partial config onto defaults", () => {
    const normalized = normalizeAttachmentBehaviorConfig({
      outcomeHints: {
        ...buildDefaultAttachmentBehaviorConfig().outcomeHints,
        manualFallback: "Custom fallback copy.",
      },
    });

    expect(normalized.outcomeHints.manualFallback).toBe("Custom fallback copy.");
    expect(normalized.safetyFloors.requireMedicalConsent).toBe(true);
  });

  describe("safety floors", () => {
    it("forces safety floors when malicious config tries to disable them", () => {
      const defaults = buildDefaultAttachmentBehaviorConfig();
      const malicious = {
        ...defaults,
        safetyFloors: {
          requireMedicalConsent: false,
          enforceProviderIsolation: false,
          requireOwnershipChecks: false,
          suppressMedicalPlanProposals: false,
        },
        consent: {
          ...defaults.consent,
          requiredMedicalScopes: ["parse_ocr"],
          uploadStorageScopeRequired: false,
        },
      } as unknown as AttachmentBehaviorConfig;

      const { config, warnings } = applyAttachmentBehaviorSafetyFloors(malicious, defaults);

      expect(config.safetyFloors.requireMedicalConsent).toBe(true);
      expect(config.safetyFloors.enforceProviderIsolation).toBe(true);
      expect(config.safetyFloors.requireOwnershipChecks).toBe(true);
      expect(config.safetyFloors.suppressMedicalPlanProposals).toBe(true);
      expect(config.consent.requiredMedicalScopes).toContain("upload_storage");
      expect(config.consent.uploadStorageScopeRequired).toBe(true);
      expect(warnings.some((warning) => warning.includes("safetyFloors"))).toBe(true);
      expect(warnings.some((warning) => warning.includes("upload_storage"))).toBe(true);
    });

    it("applies safety floors during loaded file normalization", () => {
      const defaults = buildDefaultAttachmentBehaviorConfig();
      const loaded = resolveLoadedAttachmentBehaviorConfig({
        fileValue: {
          ...defaults,
          safetyFloors: {
            requireMedicalConsent: false,
            enforceProviderIsolation: false,
            requireOwnershipChecks: false,
            suppressMedicalPlanProposals: false,
          },
        },
        defaults,
      });

      expect(loaded.source).toBe("file");
      expect(loaded.config.safetyFloors).toEqual(defaults.safetyFloors);
      expect(loaded.warnings.some((warning) => warning.includes("safetyFloors"))).toBe(true);
    });
  });
});
