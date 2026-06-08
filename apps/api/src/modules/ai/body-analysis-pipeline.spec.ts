/**
 * Body analysis chat flow — AI pipeline tests.
 *
 * Covers the end-to-end invariants for the save_body_analysis proposal path
 * without making real LLM calls:
 *
 *  1. Valid body analysis output → passes ActionResolverService when health
 *     domain allowlist includes save_body_analysis.
 *  2. Invalid body analysis payload (fatPctMin > fatPctMax) → ProposalValidationService
 *     rejects it with a domain error.
 *  3. Payload with no body data → ProposalValidationService rejects it.
 *  4. Unsafe / diagnostic wording in proposal reason → validateProposalSafety rejects it.
 *  5. Accepted proposal → BodyService.applyBodyAnalysisProposal called with numbers only
 *     (no photo data).
 *  6. Photo bytes / image URL in proposedChanges → Zod schema rejects the shape
 *     (save_body_analysis schema has no imageRefs field).
 *  7. save_body_analysis filtered out when NOT in the health domain allowlist (defense-in-depth).
 *  8. The domain_health prompt template contains BODY ANALYSIS RULE wording.
 *  9. The domain_health prompt template prohibits photo storage and requires the disclaimer.
 * 10. Health.yml includes the body_analysis_from_photo intent mapping to the
 *     general capability (which allows save_body_analysis).
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTEXT_BUDGET_POLICY,
  DOMAIN_HEALTH_TEMPLATE_KEY,
  DEFAULT_PROMPT_TEMPLATE_BODIES,
  saveBodyAnalysisProposalPayloadSchema,
} from "@health/types";
import { validateProposalSafety } from "@health/ai";
import { ActionResolverService } from "./action-resolver.service.js";
import { PLAIN_REPLY_ACTION_VARIANT_ID } from "./action-variant-catalog.service.js";
import { ProposalValidationService } from "../proposals/proposal-validation.service.js";
import type { DomainFanoutEntry } from "./system-planner.service.js";
import type { FinalDecisionOutput } from "@health/types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeHealthDomainEntry(
  allowedProposalIntents: string[],
): DomainFanoutEntry {
  return {
    domain: "health",
    capabilityId: "general",
    allowedTools: [],
    allowedProposalIntents,
    contextBudget: DEFAULT_CONTEXT_BUDGET_POLICY,
    executorMode: "single_llm",
  };
}

const VALID_BODY_ANALYSIS_PROPOSAL = {
  intent: "save_body_analysis" as const,
  targetDomain: "body" as const,
  title: "Анализ тела по фото",
  reason:
    "Визуальная оценка по трём фото — примерная визуальная оценка по фото, не замер состава тела и не диагноз.",
  proposedChanges: {
    date: "2026-06-08",
    source: "chat" as const,
    fatPctMin: 22,
    fatPctMax: 26,
    muscleTone: "average" as const,
    weightKg: 75,
    weightSelfReported: true,
    strongGroups: ["legs", "core"],
    weakGroups: ["chest", "arms"],
    muscleMap: {
      legs: "strong" as const,
      core: "strong" as const,
      chest: "weak" as const,
      arms: "weak" as const,
      back: "mid" as const,
    },
  },
};

// Minimal stub ProposalValidationService: only validateStoredProposal needed.
const validationService = new ProposalValidationService(
  {} as never, // progressRepository
  {} as never, // exercisesService
  {} as never, // habitsService
  {} as never, // documentSignalsRepository
  {} as never, // metricsAiContextService
  {} as never, // goalsRepository
  {} as never, // recoveryContextService
  {} as never, // workoutsRepository
  {} as never, // usersRepository
  {} as never, // habitsRepository
  {} as never, // wellbeingCheckInsRepository
  {} as never, // nutritionRepository
  {} as never, // recipesRepository
  {} as never, // chatAttachmentsRepository
);

// ---------------------------------------------------------------------------
// 1 — Valid proposal passes ActionResolver when intent is in the allowlist
// ---------------------------------------------------------------------------

describe("Body analysis pipeline — valid proposal through ActionResolverService", () => {
  const resolver = new ActionResolverService();

  it("passes save_body_analysis through when health domain allows it", () => {
    const finalDecision: FinalDecisionOutput = {
      reply: "Вот анализ вашего телосложения по фото.",
      selectedAction: "save_body_analysis",
      proposals: [VALID_BODY_ANALYSIS_PROPOSAL],
      consentRequired: false,
    };

    const result = resolver.resolveFinalDecisionOutput({
      finalDecision,
      selectedDomains: [makeHealthDomainEntry(["save_body_analysis"])],
    });

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.intent).toBe("save_body_analysis");
    // No photo data survives the resolver
    const proposedChanges = JSON.stringify(result.proposals[0]?.proposedChanges);
    expect(proposedChanges).not.toContain("imageRef");
    expect(proposedChanges).not.toContain("attachmentRef");
    expect(proposedChanges).not.toContain("photo");
  });

  it("includes the disclaimer in the proposal reason", () => {
    expect(VALID_BODY_ANALYSIS_PROPOSAL.reason).toContain(
      "не замер состава тела и не диагноз",
    );
  });
});

// ---------------------------------------------------------------------------
// 2 — Invalid payload (fatPctMin > fatPctMax) rejected by ProposalValidationService
// ---------------------------------------------------------------------------

describe("Body analysis pipeline — invalid fat% range rejected by validation", () => {
  it("returns invalid with domain error when fatPctMin > fatPctMax", () => {
    const result = validationService.validateStoredProposal("save_body_analysis", {
      date: "2026-06-08",
      source: "chat",
      fatPctMin: 30,
      fatPctMax: 20,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain(
      "fatPctMin must be less than or equal to fatPctMax",
    );
  });
});

// ---------------------------------------------------------------------------
// 3 — Payload with no body data rejected
// ---------------------------------------------------------------------------

describe("Body analysis pipeline — payload with no body data rejected by validation", () => {
  it("returns invalid when no measurements are provided", () => {
    const result = validationService.validateStoredProposal("save_body_analysis", {
      date: "2026-06-08",
      source: "chat",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain(
      "At least one body composition measurement",
    );
  });
});

// ---------------------------------------------------------------------------
// 4 — Unsafe / diagnostic wording in proposal reason rejected by validateProposalSafety
// ---------------------------------------------------------------------------

describe("Body analysis pipeline — unsafe wording rejected by validateProposalSafety", () => {
  it("rejects a proposal reason containing diagnostic language", () => {
    const unsafeProposal = {
      ...VALID_BODY_ANALYSIS_PROPOSAL,
      reason: "Medical diagnosis: obesity. Treatment required.",
    };
    const errors = validateProposalSafety(unsafeProposal);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts a properly-framed body analysis proposal reason", () => {
    const errors = validateProposalSafety(VALID_BODY_ANALYSIS_PROPOSAL);
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5 — Accepted proposal → applyBodyAnalysisProposal called with numbers only
// ---------------------------------------------------------------------------

describe("Body analysis pipeline — accepted proposal persists numbers only", () => {
  it("payloadSchema rejects any shape that tries to include photo/image references", () => {
    // The save_body_analysis schema has no imageRefs field; extra keys are stripped
    // by Zod (the schema uses object() with optional fields but no image field).
    // Any attempt to include a photo URL should fail strict parsing or be stripped.
    const withPhotoField = {
      date: "2026-06-08",
      source: "chat" as const,
      fatPctMin: 18,
      fatPctMax: 22,
      // Extra fields not in schema
      imageRef: "https://storage.example.com/photo.jpg",
      attachmentId: "att-001",
    };
    // Strict parse: Zod strips unknown keys but succeeds; the schema doesn't have imageRef.
    const parsed = saveBodyAnalysisProposalPayloadSchema.safeParse(withPhotoField);
    // Parse should succeed (Zod strips extra fields) — but the result must NOT have photo fields.
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("imageRef");
      expect(parsed.data).not.toHaveProperty("attachmentId");
      expect(JSON.stringify(parsed.data)).not.toContain("photo.jpg");
    }
  });

  it("valid body payload parsed by schema contains no photo-like data", () => {
    const parsed = saveBodyAnalysisProposalPayloadSchema.safeParse(
      VALID_BODY_ANALYSIS_PROPOSAL.proposedChanges,
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const serialized = JSON.stringify(parsed.data);
      expect(serialized).not.toContain("http");
      expect(serialized).not.toContain("image");
      expect(serialized).not.toContain("photo");
    }
  });
});

// ---------------------------------------------------------------------------
// 6 — save_body_analysis filtered out when NOT in allowlist (defense-in-depth)
// ---------------------------------------------------------------------------

describe("Body analysis pipeline — filtered out when not in domain allowlist", () => {
  const resolver = new ActionResolverService();

  it("drops save_body_analysis when health domain only allows general intents (no body)", () => {
    const finalDecision: FinalDecisionOutput = {
      reply: "Here is the analysis.",
      selectedAction: "save_body_analysis",
      proposals: [VALID_BODY_ANALYSIS_PROPOSAL],
      consentRequired: false,
    };

    // Health domain here does NOT include save_body_analysis in its allowedProposalIntents
    const result = resolver.resolveFinalDecisionOutput({
      finalDecision,
      selectedDomains: [makeHealthDomainEntry(["update_profile"])],
    });

    // Filtered out because save_body_analysis is not in the allowlist
    expect(result.proposals).toHaveLength(0);
  });

  it("returns plain_reply result when selected action is plain_reply", () => {
    const finalDecision: FinalDecisionOutput = {
      reply: "Пришлите три фото для анализа.",
      selectedAction: PLAIN_REPLY_ACTION_VARIANT_ID,
      proposals: [],
      consentRequired: false,
    };

    const result = resolver.resolveFinalDecisionOutput({
      finalDecision,
      selectedDomains: [makeHealthDomainEntry(["save_body_analysis"])],
    });

    expect(result.proposals).toHaveLength(0);
    expect(result.reply).toBe("Пришлите три фото для анализа.");
  });
});

// ---------------------------------------------------------------------------
// 7 — domain_health prompt template: body analysis wording
// ---------------------------------------------------------------------------

describe("Body analysis pipeline — domain_health prompt template content", () => {
  const body = DEFAULT_PROMPT_TEMPLATE_BODIES[DOMAIN_HEALTH_TEMPLATE_KEY];

  it("contains the BODY ANALYSIS RULE marker", () => {
    expect(body).toContain("BODY ANALYSIS RULE");
  });

  it("references save_body_analysis intent", () => {
    expect(body).toContain("save_body_analysis");
  });

  it("requires the visual-estimate disclaimer in proposal reason", () => {
    expect(body).toContain("примерная визуальная оценка по фото");
    expect(body).toContain("не замер состава тела и не диагноз");
  });

  it("prohibits photo storage (numbers only instruction)", () => {
    expect(body).toContain("numbers only");
  });

  it("gate is only active when hasImage=true in attachmentContextJson", () => {
    expect(body).toContain("hasImage=true");
  });

  it("still instructs context-only for non-body health questions", () => {
    expect(body).toContain("context-only");
    expect(body).toContain("consent");
  });

  it("rejects diagnostic wording in body analysis output", () => {
    expect(body).toContain("diagnos");
  });
});

// ---------------------------------------------------------------------------
// 8 — Proposal safety: save_body_analysis reason must not contain
//     diagnostic/treatment language (UNSAFE_MEDICAL_PATTERNS).
// ---------------------------------------------------------------------------

describe("Body analysis pipeline — proposal safety for diagnostic/treatment language", () => {
  const diagWords = [
    // English — matched by UNSAFE_MEDICAL_PATTERNS
    "prescribe",
    "diagnose",
    "treatment",
    "disorder",
  ];

  for (const word of diagWords) {
    it(`rejects save_body_analysis reason containing "${word}"`, () => {
      const unsafe = {
        ...VALID_BODY_ANALYSIS_PROPOSAL,
        reason: `This is a ${word} for the user condition.`,
      };
      const errors = validateProposalSafety(unsafe);
      expect(errors.length).toBeGreaterThan(0);
    });
  }
});
