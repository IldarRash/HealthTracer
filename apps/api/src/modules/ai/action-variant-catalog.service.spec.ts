/**
 * ActionVariantCatalogService tests
 *
 * Covers:
 *  - plain_reply is always present and always first
 *  - proposal intent variants are the union of selected domains' allowedProposalIntents
 *  - no duplicates even when two domains share an intent
 *  - medical_document_save is ONLY present when hasMedicalAttachmentWithConsentGranted=true
 *  - medical_document_save is absent when no attachment context is provided
 *  - medical_document_save is absent when consent is not granted
 *  - catalog is capped at MAX_CATALOG_ENTRIES (20)
 *  - empty selectedDomains still returns plain_reply
 *  - requiresConsent is true only on the medical_document_save variant
 */
import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_CONTEXT_BUDGET_POLICY } from "@health/types";
import {
  ActionVariantCatalogService,
  PLAIN_REPLY_ACTION_VARIANT_ID,
  MEDICAL_DOCUMENT_SAVE_ACTION_VARIANT_ID,
  type BuildActionVariantCatalogInput,
} from "./action-variant-catalog.service.js";
import type { DomainFanoutEntry } from "./system-planner.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDomainEntry(
  domain: DomainFanoutEntry["domain"],
  allowedProposalIntents: string[],
): DomainFanoutEntry {
  return {
    domain,
    capabilityId: domain === "workout" ? "adjust_workout" : "adjust_nutrition",
    allowedTools: [],
    allowedProposalIntents,
    contextBudget: DEFAULT_CONTEXT_BUDGET_POLICY,
    executorMode: "single_llm",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ActionVariantCatalogService", () => {
  let service: ActionVariantCatalogService;

  beforeEach(() => {
    service = new ActionVariantCatalogService();
  });

  it("always returns plain_reply as the first entry", () => {
    const catalog = service.buildCatalog({ selectedDomains: [] });
    expect(catalog[0]?.id).toBe(PLAIN_REPLY_ACTION_VARIANT_ID);
  });

  it("returns plain_reply even with no selected domains", () => {
    const catalog = service.buildCatalog({ selectedDomains: [] });
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.id).toBe(PLAIN_REPLY_ACTION_VARIANT_ID);
  });

  it("plain_reply has requiresConsent=false", () => {
    const catalog = service.buildCatalog({ selectedDomains: [] });
    const plainReply = catalog.find((v) => v.id === PLAIN_REPLY_ACTION_VARIANT_ID);
    expect(plainReply?.requiresConsent).toBe(false);
  });

  it("includes union of selected domains' allowedProposalIntents", () => {
    const input: BuildActionVariantCatalogInput = {
      selectedDomains: [
        makeDomainEntry("workout", ["create_workout_plan", "adapt_workout_plan"]),
        makeDomainEntry("nutrition", ["create_nutrition_plan"]),
      ],
    };
    const catalog = service.buildCatalog(input);
    const ids = catalog.map((v) => v.id);
    expect(ids).toContain("create_workout_plan");
    expect(ids).toContain("adapt_workout_plan");
    expect(ids).toContain("create_nutrition_plan");
  });

  it("deduplicates intents that appear in multiple domains", () => {
    const input: BuildActionVariantCatalogInput = {
      selectedDomains: [
        makeDomainEntry("workout", ["adapt_workout_plan", "create_workout_plan"]),
        makeDomainEntry("nutrition", ["adapt_workout_plan", "create_nutrition_plan"]),
      ],
    };
    const catalog = service.buildCatalog(input);
    const ids = catalog.map((v) => v.id);
    const adaptCount = ids.filter((id) => id === "adapt_workout_plan").length;
    expect(adaptCount).toBe(1);
  });

  it("excludes medical_document_save when no attachment context is provided", () => {
    const catalog = service.buildCatalog({
      selectedDomains: [makeDomainEntry("health", [])],
    });
    const ids = catalog.map((v) => v.id);
    expect(ids).not.toContain(MEDICAL_DOCUMENT_SAVE_ACTION_VARIANT_ID);
  });

  it("excludes medical_document_save when hasMedicalAttachmentWithConsentGranted=false", () => {
    const catalog = service.buildCatalog({
      selectedDomains: [makeDomainEntry("health", [])],
      attachmentContext: { hasMedicalAttachmentWithConsentGranted: false },
    });
    const ids = catalog.map((v) => v.id);
    expect(ids).not.toContain(MEDICAL_DOCUMENT_SAVE_ACTION_VARIANT_ID);
  });

  it("includes medical_document_save when hasMedicalAttachmentWithConsentGranted=true", () => {
    const catalog = service.buildCatalog({
      selectedDomains: [makeDomainEntry("health", [])],
      attachmentContext: { hasMedicalAttachmentWithConsentGranted: true },
    });
    const ids = catalog.map((v) => v.id);
    expect(ids).toContain(MEDICAL_DOCUMENT_SAVE_ACTION_VARIANT_ID);
  });

  it("medical_document_save has requiresConsent=true", () => {
    const catalog = service.buildCatalog({
      selectedDomains: [],
      attachmentContext: { hasMedicalAttachmentWithConsentGranted: true },
    });
    const medicalSave = catalog.find(
      (v) => v.id === MEDICAL_DOCUMENT_SAVE_ACTION_VARIANT_ID,
    );
    expect(medicalSave?.requiresConsent).toBe(true);
  });

  it("proposal intent variants have requiresConsent=false", () => {
    const catalog = service.buildCatalog({
      selectedDomains: [makeDomainEntry("workout", ["create_workout_plan"])],
    });
    const intentVariant = catalog.find((v) => v.id === "create_workout_plan");
    expect(intentVariant?.requiresConsent).toBe(false);
  });

  it("caps catalog at 20 entries even with many intents", () => {
    // Create 25 unique fake intent ids to force the cap
    const manyIntents = Array.from({ length: 25 }, (_, i) => `intent_${i}`);
    const catalog = service.buildCatalog({
      selectedDomains: [
        // Cast to string[] to simulate a domain with many allowed intents
        makeDomainEntry("workout", manyIntents),
      ],
      attachmentContext: { hasMedicalAttachmentWithConsentGranted: true },
    });
    expect(catalog.length).toBeLessThanOrEqual(20);
  });

  describe("isMedicalSaveEligible", () => {
    it("returns false when attachmentContext is undefined", () => {
      expect(service.isMedicalSaveEligible(undefined)).toBe(false);
    });

    it("returns false when hasMedicalAttachmentWithConsentGranted=false", () => {
      expect(
        service.isMedicalSaveEligible({ hasMedicalAttachmentWithConsentGranted: false }),
      ).toBe(false);
    });

    it("returns true when hasMedicalAttachmentWithConsentGranted=true", () => {
      expect(
        service.isMedicalSaveEligible({ hasMedicalAttachmentWithConsentGranted: true }),
      ).toBe(true);
    });
  });
});
