import { describe, expect, it } from "vitest";
import {
  applyAttachmentBehaviorSafetyFloors,
  buildDefaultAttachmentBehaviorConfig,
  normalizeAttachmentBehaviorConfig,
  resolveLoadedAttachmentBehaviorConfig,
  safeParseAttachmentBehaviorConfig,
  validateAttachmentBehaviorConfig,
} from "./attachment-behavior-config.js";

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

  it("normalizes partial retention config onto defaults", () => {
    const normalized = normalizeAttachmentBehaviorConfig({
      retention: {
        byCategory: {
          unclassified: "ephemeral_recognition",
          food_photo: "ephemeral_recognition",
          medical_document: "ephemeral_recognition",
          workout_attachment: "ephemeral_recognition",
        },
      },
    });

    expect(normalized.retention.byCategory.medical_document).toBe("ephemeral_recognition");
    expect(normalized.safetyFloors.enforceProviderIsolation).toBe(true);
  });

  describe("safety floors", () => {
    it("forces safety floors when malicious config tries to disable them", () => {
      const defaults = buildDefaultAttachmentBehaviorConfig();
      const malicious = {
        ...defaults,
        safetyFloors: {
          enforceProviderIsolation: false,
          requireOwnershipChecks: false,
          suppressMedicalPlanProposals: false,
        },
      };

      const { config, warnings } = applyAttachmentBehaviorSafetyFloors(malicious);

      expect(config.safetyFloors.enforceProviderIsolation).toBe(true);
      expect(config.safetyFloors.requireOwnershipChecks).toBe(true);
      expect(config.safetyFloors.suppressMedicalPlanProposals).toBe(true);
      expect(warnings.some((warning) => warning.includes("safetyFloors"))).toBe(true);
    });

    it("applies safety floors during loaded file normalization", () => {
      const defaults = buildDefaultAttachmentBehaviorConfig();
      const loaded = resolveLoadedAttachmentBehaviorConfig({
        fileValue: {
          ...defaults,
          safetyFloors: {
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
