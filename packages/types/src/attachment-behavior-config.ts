import { z } from "zod";
import {
  attachmentRoutingConfigSchema,
  type AttachmentRoutingConfig,
} from "./ai-behavior-config.js";
import {
  CHAT_FOOD_PHOTO_MIME_TYPES,
  CHAT_MEDICAL_DOCUMENT_MIME_TYPES,
  CHAT_PROVISIONAL_UPLOAD_MIME_TYPES,
  CHAT_WORKOUT_ATTACHMENT_MIME_TYPES,
  MAX_CHAT_FOOD_PHOTO_BYTES,
  MAX_CHAT_PROVISIONAL_ATTACHMENT_BYTES,
  MAX_CHAT_WORKOUT_ATTACHMENT_BYTES,
  chatAttachmentCategorySchema,
  chatAttachmentRetentionPolicySchema,
} from "./chat-attachments.js";
import { documentConsentScopeSchema } from "./documents.js";

export const ATTACHMENT_BEHAVIOR_CONFIG_VERSION = 1 as const;

export const attachmentBehaviorConfigVersionSchema = z.literal(ATTACHMENT_BEHAVIOR_CONFIG_VERSION);

export type AttachmentBehaviorConfigVersion = z.infer<
  typeof attachmentBehaviorConfigVersionSchema
>;

export const attachmentTurnStageSchema = z.enum([
  "validate_refs",
  "link_to_message",
  "apply_upload_disposition",
]);

export type AttachmentTurnStage = z.infer<typeof attachmentTurnStageSchema>;

export const DEFAULT_ATTACHMENT_TURN_STAGE_ORDER: readonly AttachmentTurnStage[] = [
  "validate_refs",
  "link_to_message",
  "apply_upload_disposition",
] as const;

export const attachmentSafetyFloorsConfigSchema = z.object({
  requireMedicalConsent: z.boolean().default(true),
  enforceProviderIsolation: z.boolean().default(true),
  requireOwnershipChecks: z.boolean().default(true),
  suppressMedicalPlanProposals: z.boolean().default(true),
});

export type AttachmentSafetyFloorsConfig = z.infer<typeof attachmentSafetyFloorsConfigSchema>;

export const DEFAULT_ATTACHMENT_SAFETY_FLOORS: AttachmentSafetyFloorsConfig = {
  requireMedicalConsent: true,
  enforceProviderIsolation: true,
  requireOwnershipChecks: true,
  suppressMedicalPlanProposals: true,
};

export const attachmentCategoryEntrySchema = z.object({
  category: chatAttachmentCategorySchema,
  allowedMimeTypes: z.array(z.string().min(1).max(120)).min(1).max(20),
  maxBytes: z.number().int().positive().max(50_000_000),
  label: z.string().min(1).max(80),
});

export type AttachmentCategoryEntry = z.infer<typeof attachmentCategoryEntrySchema>;

export const attachmentCategoriesConfigSchema = z.object({
  entries: z.array(attachmentCategoryEntrySchema).min(1).max(10),
  provisionalUploadMimeTypes: z.array(z.string().min(1).max(120)).min(1).max(30),
  maxProvisionalBytes: z.number().int().positive().max(50_000_000),
});

export type AttachmentCategoriesConfig = z.infer<typeof attachmentCategoriesConfigSchema>;


export const attachmentRetentionConfigSchema = z.object({
  byCategory: z.object({
    unclassified: chatAttachmentRetentionPolicySchema,
    food_photo: chatAttachmentRetentionPolicySchema,
    medical_document: chatAttachmentRetentionPolicySchema,
    workout_attachment: chatAttachmentRetentionPolicySchema,
  }),
});

export type AttachmentRetentionConfig = z.infer<typeof attachmentRetentionConfigSchema>;

export const attachmentConsentConfigSchema = z.object({
  requiredMedicalScopes: z.array(documentConsentScopeSchema).min(1).max(5),
  requireDocumentType: z.boolean().default(true),
  requireDocumentTitle: z.boolean().default(true),
  consentVersionDefault: z.string().min(1).max(40).default("v1"),
  uploadStorageScopeRequired: z.literal(true).default(true),
});

export type AttachmentConsentConfig = z.infer<typeof attachmentConsentConfigSchema>;

export const attachmentOutcomeHintsConfigSchema = z.object({
  medicalNeedsConsent: z.string().min(1).max(500),
  medicalNeedsReview: z.string().min(1).max(500),
  medicalContextOnly: z.string().min(1).max(500).optional(),
  manualFallback: z.string().min(1).max(500),
  lowConfidenceFoodPhoto: z.string().min(1).max(500),
});

export type AttachmentOutcomeHintsConfig = z.infer<typeof attachmentOutcomeHintsConfigSchema>;

export const attachmentTurnStagesConfigSchema = z.object({
  order: z.array(attachmentTurnStageSchema).min(1).max(10),
});

export type AttachmentTurnStagesConfig = z.infer<typeof attachmentTurnStagesConfigSchema>;

export const attachmentBehaviorConfigSchema = z.object({
  version: attachmentBehaviorConfigVersionSchema,
  safetyFloors: attachmentSafetyFloorsConfigSchema,
  categories: attachmentCategoriesConfigSchema,
  routing: attachmentRoutingConfigSchema,
  retention: attachmentRetentionConfigSchema,
  consent: attachmentConsentConfigSchema,
  outcomeHints: attachmentOutcomeHintsConfigSchema,
  turnStages: attachmentTurnStagesConfigSchema,
});

export type AttachmentBehaviorConfig = z.infer<typeof attachmentBehaviorConfigSchema>;

export type AttachmentBehaviorConfigParseResult =
  | { success: true; data: AttachmentBehaviorConfig }
  | { success: false; errors: readonly string[] };

export type AttachmentBehaviorConfigLoadSource = "file" | "defaults";

export type AttachmentBehaviorConfigLoadResult = {
  config: AttachmentBehaviorConfig;
  source: AttachmentBehaviorConfigLoadSource;
  errors: readonly string[];
  warnings: readonly string[];
};



export function buildDefaultAttachmentBehaviorConfig(): AttachmentBehaviorConfig {
  return attachmentBehaviorConfigSchema.parse({
    version: ATTACHMENT_BEHAVIOR_CONFIG_VERSION,
    safetyFloors: DEFAULT_ATTACHMENT_SAFETY_FLOORS,
    categories: {
      entries: [
        {
          category: "unclassified",
          allowedMimeTypes: [...CHAT_PROVISIONAL_UPLOAD_MIME_TYPES],
          maxBytes: MAX_CHAT_PROVISIONAL_ATTACHMENT_BYTES,
          label: "Unclassified upload",
        },
        {
          category: "food_photo",
          allowedMimeTypes: [...CHAT_FOOD_PHOTO_MIME_TYPES],
          maxBytes: MAX_CHAT_FOOD_PHOTO_BYTES,
          label: "Food photo",
        },
        {
          category: "medical_document",
          allowedMimeTypes: [...CHAT_MEDICAL_DOCUMENT_MIME_TYPES],
          maxBytes: 5_000_000,
          label: "Medical document",
        },
        {
          category: "workout_attachment",
          allowedMimeTypes: [...CHAT_WORKOUT_ATTACHMENT_MIME_TYPES],
          maxBytes: MAX_CHAT_WORKOUT_ATTACHMENT_BYTES,
          label: "Workout attachment",
        },
      ],
      provisionalUploadMimeTypes: [...CHAT_PROVISIONAL_UPLOAD_MIME_TYPES],
      maxProvisionalBytes: MAX_CHAT_PROVISIONAL_ATTACHMENT_BYTES,
    },
    routing: {
      categoryPriority: ["medical_document", "workout_attachment", "food_photo"],
      defaultCapabilityId: "attachment_food_photo",
      confidence: 0.98,
      routingMethod: "attachment_family",
    },
    retention: {
      byCategory: {
        unclassified: "ephemeral_recognition",
        food_photo: "ephemeral_recognition",
        medical_document: "document_consent_rules",
        workout_attachment: "ephemeral_recognition",
      },
    },
    consent: {
      requiredMedicalScopes: ["upload_storage"],
      requireDocumentType: true,
      requireDocumentTitle: true,
      consentVersionDefault: "v1",
      uploadStorageScopeRequired: true,
    },
    outcomeHints: {
      medicalNeedsConsent:
        "This attachment was identified as a wellness document after send. Grant consent below to store and process it. Nothing is saved until you confirm.",
      medicalNeedsReview:
        "This wellness document needs review before it can be used in coaching context.",
      medicalContextOnly:
        "This wellness document is available as chat attachment context only. It has not been saved or parsed as a health document.",
      manualFallback:
        "We could not confidently classify this attachment. Choose a category or try again with clearer context.",
      lowConfidenceFoodPhoto:
        "The meal photo was analyzed with low confidence. Review items before logging.",
    },
    turnStages: {
      order: [...DEFAULT_ATTACHMENT_TURN_STAGE_ORDER],
    },
  });
}

export function formatAttachmentBehaviorConfigValidationErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "attachmentBehaviorConfig";
    return `${path}: ${issue.message}`;
  });
}

export function safeParseAttachmentBehaviorConfig(
  value: unknown,
): AttachmentBehaviorConfigParseResult {
  const parsed = attachmentBehaviorConfigSchema.safeParse(value);

  if (parsed.success) {
    return { success: true, data: parsed.data };
  }

  return { success: false, errors: formatAttachmentBehaviorConfigValidationErrors(parsed.error) };
}

export function validateAttachmentBehaviorConfig(value: unknown): string[] {
  const result = safeParseAttachmentBehaviorConfig(value);
  return result.success ? [] : [...result.errors];
}

export function applyAttachmentBehaviorSafetyFloors(
  config: AttachmentBehaviorConfig,
  defaults: AttachmentBehaviorConfig = buildDefaultAttachmentBehaviorConfig(),
): { config: AttachmentBehaviorConfig; warnings: string[] } {
  const warnings: string[] = [];
  const next: AttachmentBehaviorConfig = {
    ...config,
    safetyFloors: { ...DEFAULT_ATTACHMENT_SAFETY_FLOORS },
    consent: {
      ...config.consent,
      uploadStorageScopeRequired: true,
      requiredMedicalScopes: config.consent.requiredMedicalScopes.includes("upload_storage")
        ? config.consent.requiredMedicalScopes
        : (() => {
            warnings.push(
              "consent.requiredMedicalScopes: upload_storage scope cannot be removed; restoring default medical consent scopes.",
            );
            return [...defaults.consent.requiredMedicalScopes];
          })(),
    },
  };

  for (const [key, requiredValue] of Object.entries(DEFAULT_ATTACHMENT_SAFETY_FLOORS) as Array<
    [keyof AttachmentSafetyFloorsConfig, boolean]
  >) {
    if (config.safetyFloors[key] !== requiredValue) {
      warnings.push(
        `safetyFloors.${key}: safety floor cannot be disabled via config; forced to ${String(requiredValue)}.`,
      );
    }
  }

  if (!config.consent.requiredMedicalScopes.includes("upload_storage")) {
    // Warning already emitted above when restoring scopes.
  } else if (config.consent.uploadStorageScopeRequired !== true) {
    warnings.push(
      "consent.uploadStorageScopeRequired: medical upload_storage requirement cannot be disabled via config; forced to true.",
    );
  }

  return { config: next, warnings };
}

export function normalizeAttachmentBehaviorConfig(
  partial: Partial<AttachmentBehaviorConfig> | undefined,
  defaults: AttachmentBehaviorConfig = buildDefaultAttachmentBehaviorConfig(),
): AttachmentBehaviorConfig {
  const merged = {
    ...defaults,
    ...partial,
    safetyFloors: {
      ...defaults.safetyFloors,
      ...partial?.safetyFloors,
    },
    categories: {
      ...defaults.categories,
      ...partial?.categories,
      entries: partial?.categories?.entries ?? defaults.categories.entries,
    },
    routing: {
      ...defaults.routing,
      ...partial?.routing,
      categoryPriority: partial?.routing?.categoryPriority ?? defaults.routing.categoryPriority,
    },
    retention: {
      byCategory: {
        ...defaults.retention.byCategory,
        ...partial?.retention?.byCategory,
      },
    },
    consent: {
      ...defaults.consent,
      ...partial?.consent,
    },
    outcomeHints: {
      ...defaults.outcomeHints,
      ...partial?.outcomeHints,
    },
    turnStages: {
      order: partial?.turnStages?.order ?? defaults.turnStages.order,
    },
  };

  const parsed = attachmentBehaviorConfigSchema.parse(merged);
  return parsed;
}

export function resolveLoadedAttachmentBehaviorConfig(input: {
  fileValue?: unknown;
  defaults?: AttachmentBehaviorConfig;
}): AttachmentBehaviorConfigLoadResult {
  const defaults = input.defaults ?? buildDefaultAttachmentBehaviorConfig();

  if (input.fileValue == null) {
    return {
      config: defaults,
      source: "defaults",
      errors: [],
      warnings: ["Attachment behavior config file missing; using built-in defaults."],
    };
  }

  const parsed = safeParseAttachmentBehaviorConfig(input.fileValue);

  if (parsed.success) {
    const normalized = normalizeAttachmentBehaviorConfig(parsed.data, defaults);
    const { config, warnings } = applyAttachmentBehaviorSafetyFloors(normalized, defaults);

    return {
      config,
      source: "file",
      errors: [],
      warnings,
    };
  }

  return {
    config: defaults,
    source: "defaults",
    errors: parsed.errors,
    warnings: ["Invalid attachment behavior config; using built-in defaults."],
  };
}

export function resolveAttachmentRoutingFromBehavior(
  config: AttachmentBehaviorConfig,
): AttachmentRoutingConfig {
  return config.routing;
}

