import { describe, expect, it } from "vitest";
import {
  AGENT_INTENT_CATALOG,
  filterProposalsToAllowedIntents,
  filterProposalsToCatalogAllowlist,
  getAllowedProposalIntentsForCatalogIntent,
  getAllowedToolsForCatalogIntent,
  getIntentCatalogEntry,
  intentCatalogEntrySchema,
  listRouterCatalogEntries,
  serializeIntentCatalogForRouter,
} from "./intent-catalog.js";

describe("intent catalog", () => {
  it("includes normal and attachment family intents", () => {
    expect(AGENT_INTENT_CATALOG.some((entry) => entry.kind === "normal")).toBe(true);
    expect(AGENT_INTENT_CATALOG.some((entry) => entry.kind === "attachment_family")).toBe(true);
  });

  it("exposes only normal intents to the text router catalog", () => {
    const routerEntries = listRouterCatalogEntries();

    expect(routerEntries.every((entry) => entry.kind === "normal")).toBe(true);
    expect(routerEntries.some((entry) => entry.id === "attachment_food_photo")).toBe(false);
    expect(routerEntries.some((entry) => entry.id === "proposal_explainer")).toBe(false);
  });

  it("serializes router guidance for turn decision catalog hints", () => {
    const serialized = serializeIntentCatalogForRouter();

    expect(serialized.length).toBeGreaterThan(0);
    expect(serialized[0]).toMatchObject({
      id: expect.any(String),
      description: expect.any(String),
      routerGuidance: expect.any(String),
    });
    expect(getIntentCatalogEntry("general").allowedTools.length).toBeGreaterThan(0);
  });

  it("parses every catalog entry through the shared schema", () => {
    for (const entry of AGENT_INTENT_CATALOG) {
      expect(intentCatalogEntrySchema.parse(entry).id).toBe(entry.id);
    }
  });

  it("restricts attachment families to their recognition-specific tools and proposals", () => {
    expect(getAllowedToolsForCatalogIntent("attachment_food_photo")).toEqual([
      "getUserContextSlice",
    ]);
    expect(getAllowedProposalIntentsForCatalogIntent("attachment_food_photo")).toEqual([
      "log_nutrition_incident",
    ]);

    expect(getAllowedToolsForCatalogIntent("attachment_workout")).toEqual([
      "getUserContextSlice",
      "getWeeklyProgressContext",
    ]);
    expect(getAllowedProposalIntentsForCatalogIntent("attachment_workout")).toEqual(
      expect.arrayContaining([
        "create_workout_plan",
        "adapt_workout_plan",
        "adapt_workout_plan_from_progress",
        "create_today_checklist",
      ]),
    );

    expect(getAllowedToolsForCatalogIntent("attachment_medical_document")).toEqual([
      "getDocumentContext",
    ]);
    expect(getAllowedProposalIntentsForCatalogIntent("attachment_medical_document")).toEqual([]);
  });

  it("blocks medical and health-context intents from state-changing proposals", () => {
    expect(getAllowedProposalIntentsForCatalogIntent("ask_health_context")).toEqual([]);

    const filtered = filterProposalsToCatalogAllowlist("attachment_medical_document", [
      { intent: "log_nutrition_incident" },
      { intent: "adapt_workout_plan" },
    ]);

    expect(filtered).toEqual([]);
  });

  it("filters final-answer proposals to the active catalog allowlist", () => {
    const filtered = filterProposalsToCatalogAllowlist("adjust_workout", [
      { intent: "adapt_workout_plan" },
      { intent: "log_nutrition_incident" },
      { intent: "adapt_workout_plan_from_progress" },
    ]);

    expect(filtered.map((proposal) => proposal.intent)).toEqual([
      "adapt_workout_plan",
      "adapt_workout_plan_from_progress",
    ]);
  });

  it("filters proposals to an explicit allowed-intent policy list", () => {
    const allowed = getAllowedProposalIntentsForCatalogIntent("adjust_workout");
    const filtered = filterProposalsToAllowedIntents(allowed, [
      { intent: "adapt_workout_plan" },
      { intent: "log_nutrition_incident" },
    ]);

    expect(filtered.map((proposal) => proposal.intent)).toEqual(["adapt_workout_plan"]);
  });
});
