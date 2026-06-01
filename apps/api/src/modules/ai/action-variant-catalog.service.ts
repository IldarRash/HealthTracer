/**
 * ActionVariantCatalogService
 *
 * Builds the bounded action-variant catalog passed to the decision-maker LLM.
 *
 * The catalog is a CODE-OWNED FLOOR: the decision-maker may only pick variants
 * within it. ActionResolverService re-filters the chosen variant against the
 * active capability allowlist so no widening is possible.
 *
 * Composition rules (all code-enforced — not config-driven):
 *
 *   1. "plain_reply" is ALWAYS present (decision-maker can always choose to
 *      reply with no structured action).
 *
 *   2. One entry per `allowedProposalIntent` from the UNION of the selected
 *      domains' clamped allowlists (DomainFanoutEntry.allowedProposalIntents).
 *      The union cannot exceed MAX_CATALOG_ENTRIES. Each entry maps directly to
 *      a CatalogProposalIntent so ActionResolver can re-validate it.
 *
 *   3. "medical_document_save" is included ONLY when ALL of the following are
 *      true this turn (consent-gated by code, not by config):
 *        a. A medical attachment is present in the turn context.
 *        b. The attachment status is "consent_granted" (not just present).
 *      If either condition is absent the variant is NOT added. The decision-maker
 *      cannot infer or fabricate consent; the gate is checked against the
 *      attachment context metadata passed to the orchestrator.
 *
 * Safety floors (must not be weakened):
 *   - This service NEVER widens beyond the union of the selected domains'
 *     clamped allowedProposalIntents + the two reserved variants above.
 *   - Duplicate intent ids are deduplicated (first occurrence wins).
 *   - The "medical_document_save" variant carries requiresConsent:true and is
 *     structurally distinct from any CatalogProposalIntent; ActionResolver gates
 *     it separately and will never auto-persist a health_documents row.
 */

import type { ActionVariant } from "@health/types";
import { Injectable } from "@nestjs/common";
import type { DomainFanoutEntry } from "./system-planner.service.js";

// ---------------------------------------------------------------------------
// Reserved action variant ids — these are NOT CatalogProposalIntents.
// They are structural variants that the decision-maker can select but that
// ActionResolver handles specially (no domain proposal write).
// ---------------------------------------------------------------------------

/** Always included: the decision-maker selects this to produce a plain reply. */
export const PLAIN_REPLY_ACTION_VARIANT_ID = "plain_reply" as const;

/**
 * Consent-gated medical document save. Included ONLY when a medical attachment
 * is present AND the user has granted consent this turn.
 * ActionResolver NEVER auto-persists a health_documents row — it surfaces a
 * consent-gated proposal that the user must accept explicitly.
 */
export const MEDICAL_DOCUMENT_SAVE_ACTION_VARIANT_ID = "medical_document_save" as const;

// Maximum number of entries in the catalog passed to the decision-maker.
// Keeps the LLM context bounded; the union of allowedProposalIntents is
// already capped by the capability catalog per domain (≤15) × at most 3
// domains, but we apply an extra cap to keep the catalog lean.
const MAX_CATALOG_ENTRIES = 20 as const;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface BuildActionVariantCatalogInput {
  /**
   * The selected domain fan-out entries from the SystemPlanner.
   * Each entry carries the independently clamped allowedProposalIntents
   * (already intersected with the capability catalog — YAML/router cannot
   * have widened them).
   */
  selectedDomains: readonly DomainFanoutEntry[];

  /**
   * Attachment context for this turn. Used to decide whether the
   * consent-gated medical_document_save variant is eligible.
   */
  attachmentContext?: ActionVariantCatalogAttachmentContext;
}

/**
 * Minimal attachment metadata needed for the medical-save gate.
 * The orchestrator extracts this from AttachmentTurnContextItem before
 * calling buildCatalog.
 */
export interface ActionVariantCatalogAttachmentContext {
  /**
   * Whether any attachment in this turn has category === "medical_document"
   * AND status === "consent_granted". Both conditions must be true.
   * The status check is the code-level consent gate.
   */
  hasMedicalAttachmentWithConsentGranted: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ActionVariantCatalogService {
  /**
   * Build the bounded action-variant catalog for the decision-maker.
   *
   * The result is the MINIMUM set of variants the decision-maker may select
   * from. ActionResolverService re-filters proposals against the active
   * capability allowlist after the decision-maker runs — no widening is
   * possible at either stage.
   */
  buildCatalog(input: BuildActionVariantCatalogInput): ActionVariant[] {
    const catalog: ActionVariant[] = [];
    const seenIds = new Set<string>();

    // 1. "plain_reply" — always first so the decision-maker sees it prominently.
    catalog.push({
      id: PLAIN_REPLY_ACTION_VARIANT_ID,
      label: "Plain reply",
      description:
        "Return a coaching reply without any structured proposal or action. Use when no domain action is needed.",
      requiresConsent: false,
    });
    seenIds.add(PLAIN_REPLY_ACTION_VARIANT_ID);

    // 2. Union of selected domains' allowedProposalIntents (clamped; deduped).
    for (const domainEntry of input.selectedDomains) {
      for (const intentId of domainEntry.allowedProposalIntents) {
        if (seenIds.has(intentId)) {
          continue;
        }

        if (catalog.length >= MAX_CATALOG_ENTRIES) {
          break;
        }

        catalog.push(buildProposalIntentVariant(intentId, domainEntry.domain));
        seenIds.add(intentId);
      }

      if (catalog.length >= MAX_CATALOG_ENTRIES) {
        break;
      }
    }

    // 3. Consent-gated medical_document_save — only when fully eligible.
    //    Gate: medical attachment present + consent_granted status.
    if (
      input.attachmentContext?.hasMedicalAttachmentWithConsentGranted === true &&
      !seenIds.has(MEDICAL_DOCUMENT_SAVE_ACTION_VARIANT_ID) &&
      catalog.length < MAX_CATALOG_ENTRIES
    ) {
      catalog.push({
        id: MEDICAL_DOCUMENT_SAVE_ACTION_VARIANT_ID,
        label: "Save medical document (consent required)",
        description:
          "Propose saving this medical document to the user's health record. " +
          "Requires explicit user consent — the document is NEVER auto-persisted. " +
          "Only eligible when the user has already granted consent for this attachment.",
        requiresConsent: true,
      });
    }

    return catalog;
  }

  /**
   * Check whether the medical_document_save variant would be eligible for a
   * given attachment context. Used by tests and the orchestrator.
   */
  isMedicalSaveEligible(
    attachmentContext: ActionVariantCatalogAttachmentContext | undefined,
  ): boolean {
    return attachmentContext?.hasMedicalAttachmentWithConsentGranted === true;
  }
}

// ---------------------------------------------------------------------------
// Module-level helper
// ---------------------------------------------------------------------------

/**
 * Build an ActionVariant for a CatalogProposalIntent.
 * Labels are human-readable and kept stable (used by the LLM prompt).
 */
function buildProposalIntentVariant(intentId: string, domain: string): ActionVariant {
  return {
    id: intentId,
    label: formatProposalIntentLabel(intentId),
    description: `Propose a ${domain} action: ${intentId.replace(/_/g, " ")}.`,
    requiresConsent: false,
  };
}

/**
 * Convert snake_case intent id to a readable label.
 * E.g. "adapt_workout_plan" → "Adapt workout plan".
 */
function formatProposalIntentLabel(intentId: string): string {
  const words = intentId.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
