import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeLogNutritionIncidentChanges } from "@health/types";
import { describe, expect, it } from "vitest";
import { NutritionRepository } from "../nutrition/nutrition.repository.js";
import { NutritionService } from "../nutrition/nutrition.service.js";
import { ProposalApplyService } from "./proposal-apply.service.js";

const proposalsRepositorySource = readFileSync(
  join(import.meta.dirname, "proposals.repository.ts"),
  "utf8",
);
const proposalsServiceSource = readFileSync(
  join(import.meta.dirname, "proposals.service.ts"),
  "utf8",
);
const proposalApplySource = readFileSync(
  join(import.meta.dirname, "proposal-apply.service.ts"),
  "utf8",
);
const nutritionRepositorySource = readFileSync(
  join(import.meta.dirname, "../nutrition/nutrition.repository.ts"),
  "utf8",
);
const nutritionServiceSource = readFileSync(
  join(import.meta.dirname, "../nutrition/nutrition.service.ts"),
  "utf8",
);

describe("proposal accept nutrition incident transaction boundary", () => {
  it("runs apply inside the locked proposal transaction and passes tx through the stack", () => {
    expect(proposalsRepositorySource).toContain(".for(\"update\")");
    expect(proposalsRepositorySource).toContain("await applyFn(proposalForApply, tx)");
    expect(proposalsServiceSource).toContain(
      "this.proposalApplyService.applyAcceptedProposal(auth, user.id, lockedProposal, tx)",
    );
    expect(proposalApplySource).toContain("tx?: HealthDatabaseTransaction");
    expect(proposalApplySource).toContain("applyNutritionIncidentProposal(");
    expect(nutritionServiceSource).toContain("findIncidentBySourceProposalId(");
    expect(nutritionServiceSource).toContain("tx?: HealthDatabaseTransaction");
    expect(nutritionRepositorySource).toContain("db: Pick<HealthDatabase, \"insert\"> = this.db");
    expect(nutritionRepositorySource).toMatch(
      /await db\s*\n\s*\.insert\(nutritionIncidents\)/,
    );
    expect(nutritionRepositorySource).not.toMatch(
      /createIncident[\s\S]*await this\.db\s*\n\s*\.insert\(nutritionIncidents\)/,
    );
    expect(nutritionRepositorySource).toContain("sourceProposalId");
  });
});

// ---------------------------------------------------------------------------
// Slice 8 — accepted NORMALIZED nutrition incident → row with stamped fields.
//
// End-to-end over the real apply stack (ProposalApplyService → NutritionService
// → NutritionRepository → captured insert): the exact scenario-2 LLM shape
// variance (string imageRefs, unknown provenance source, hallucinated date)
// goes through the real normalizer, is accepted, and the nutrition_incidents
// row carries EXACTLY the server-stamped values plus the source_proposal_id link.
// ---------------------------------------------------------------------------

describe("accepted normalized nutrition incident creates a row with server-stamped fields (Slice 8)", () => {
  const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
  const proposalId = "14a08176-64a7-4a2d-8a44-581807368394";
  const trustedAttachmentId = "7c1f2a3b-4d5e-4f60-8a71-92b3c4d5e6f7";
  const hallucinatedImageRefId = "9e2a1b0c-3d4e-4f50-8a61-72b3c4d5e6f8";
  const nowIso = "2026-06-12T09:30:00.000Z";

  const auth = {
    clerkUserId: "user_123",
    displayName: "Test User",
    email: "test@example.com",
  };

  it("persists the stamped imageRefs/provenance/incidentDateTime and links source_proposal_id", async () => {
    // Raw LLM payload variance pinned from live DB evidence (scenario 2):
    // imageRefs as UUID strings (not the trusted attachment), provenance source
    // outside the enum, and a hallucinated past date.
    const rawLlmChanges = {
      incidentDateTime: "2023-10-05",
      items: [
        { name: "Scrambled eggs", calories: 220, proteinGrams: 14, carbsGrams: 2, fatGrams: 16 },
        { name: "Toast", calories: 160, proteinGrams: 5, carbsGrams: 28, fatGrams: 2 },
      ],
      estimatedCalories: 380,
      estimatedMacros: { proteinGrams: 19, carbsGrams: 30, fatGrams: 18 },
      confidence: "medium",
      provenance: { source: "image_estimate", providerId: "nutrition_domain_llm" },
      imageRefs: [hallucinatedImageRefId],
    };

    const normalized = normalizeLogNutritionIncidentChanges(rawLlmChanges, {
      nowIso,
      imageAttachmentIds: [trustedAttachmentId],
    });

    let insertedValues: Record<string, unknown> | undefined;
    const fakeDb = {
      // findIncidentBySourceProposalId → no existing incident for this proposal.
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [] }) }),
      }),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          insertedValues = values;
          return { returning: async () => [{ ...values, id: "incident-row-1" }] };
        },
      }),
    };

    const usersService = {
      getUserById: async () => ({
        id: userId,
        email: "test@example.com",
        displayName: "Test User",
        timezone: "UTC",
        createdAt: nowIso,
        updatedAt: nowIso,
      }),
    };

    const nutritionService = new NutritionService(
      new NutritionRepository(fakeDb as never),
      usersService as never,
      {} as never, // groceryDerivationService — unused on the incident path
    );

    const service = new ProposalApplyService(
      {} as never, // profilesService
      {} as never, // goalsService
      {} as never, // workoutsService
      nutritionService,
      {} as never, // habitsService
      {} as never, // recipesService
      {} as never, // todayService
      {} as never, // progressService
      {} as never, // wellbeingCheckInsService
      {} as never, // bodyService
    );

    const reference = await service.applyAcceptedProposal(auth, userId, {
      id: proposalId,
      userId,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      sourceMessageId: "34c29398-86c9-5b4f-ad21-7a2919585046",
      intent: "log_nutrition_incident",
      targetDomain: "nutrition",
      title: "Log breakfast",
      reason: "Estimated from your photo.",
      evidenceRefs: null,
      proposedChanges: normalized as Record<string, unknown>,
      status: "pending",
      validationStatus: "valid",
      validationErrors: [],
      userDecisionAt: null,
      appliedReference: null,
      createdAt: new Date(nowIso),
      updatedAt: new Date(nowIso),
    });

    expect(reference).toBe("nutrition_incident:incident-row-1");
    expect(insertedValues).toBeDefined();

    // imageRefs: exactly the trusted turn attachment, never the LLM's ref.
    expect(insertedValues?.["imageRefs"]).toEqual([{ id: trustedAttachmentId }]);
    expect(insertedValues?.["imageRefs"]).not.toContainEqual({ id: hallucinatedImageRefId });

    // provenance.source: stamped to vision_llm_estimate (images were present).
    expect(insertedValues?.["provenance"]).toEqual({
      source: "vision_llm_estimate",
      providerId: "nutrition_domain_llm",
    });

    // incidentDateTime: the hallucinated 2023 date was clamped to server "now".
    const incidentDateTime = insertedValues?.["incidentDateTime"] as Date;
    expect(incidentDateTime).toBeInstanceOf(Date);
    expect(incidentDateTime.toISOString()).toBe(nowIso);
    expect(insertedValues?.["date"]).toBe("2026-06-12");

    // Row is linked to the accepted proposal and flagged as proposal-sourced.
    expect(insertedValues?.["sourceProposalId"]).toBe(proposalId);
    expect(insertedValues?.["source"]).toBe("ai_proposal");
    expect(insertedValues?.["userId"]).toBe(userId);

    // Estimate content was never touched by normalization.
    expect(insertedValues?.["estimatedCalories"]).toBe(380);
    expect(insertedValues?.["confidence"]).toBe("medium");
  });
});
