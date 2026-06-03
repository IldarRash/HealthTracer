/**
 * ActionVariantCatalogService tests
 *
 * Covers:
 *  - plain_reply is always present and always first
 *  - proposal intent variants are the union of selected domains' allowedProposalIntents
 *  - no duplicates even when two domains share an intent
 *  - catalog is capped at MAX_CATALOG_ENTRIES (20)
 *  - empty selectedDomains still returns plain_reply
 *  - requiresConsent is false on all proposal intent variants
 */
import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_CONTEXT_BUDGET_POLICY } from "@health/types";
import {
  ActionVariantCatalogService,
  PLAIN_REPLY_ACTION_VARIANT_ID,
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

  it("does not include medical_document_save variant (removed per context-only architecture)", () => {
    const catalog = service.buildCatalog({
      selectedDomains: [makeDomainEntry("health", [])],
    });
    const ids = catalog.map((v) => v.id);
    expect(ids).not.toContain("medical_document_save");
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
      selectedDomains: [makeDomainEntry("workout", manyIntents)],
    });
    expect(catalog.length).toBeLessThanOrEqual(20);
  });

  it("catalog starts with plain_reply followed by domain intents", () => {
    const catalog = service.buildCatalog({
      selectedDomains: [makeDomainEntry("workout", ["adapt_workout_plan"])],
    });
    expect(catalog[0]?.id).toBe(PLAIN_REPLY_ACTION_VARIANT_ID);
    expect(catalog[1]?.id).toBe("adapt_workout_plan");
    expect(catalog).toHaveLength(2);
  });
});
