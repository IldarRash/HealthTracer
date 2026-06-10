import { z } from "zod";
import {
  CHAT_FOOD_PHOTO_MIME_TYPES,
  CHAT_MEDICAL_DOCUMENT_MIME_TYPES,
  CHAT_WORKOUT_ATTACHMENT_MIME_TYPES,
  MAX_CHAT_FOOD_PHOTO_BYTES,
  MAX_CHAT_WORKOUT_ATTACHMENT_BYTES,
  chatAttachmentCategorySchema,
  chatAttachmentRetentionPolicySchema,
} from "./chat-attachments.js";

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
  enforceProviderIsolation: z.boolean().default(true),
  requireOwnershipChecks: z.boolean().default(true),
  suppressMedicalPlanProposals: z.boolean().default(true),
});

export type AttachmentSafetyFloorsConfig = z.infer<typeof attachmentSafetyFloorsConfigSchema>;

export const DEFAULT_ATTACHMENT_SAFETY_FLOORS: AttachmentSafetyFloorsConfig = {
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

export const attachmentTurnStagesConfigSchema = z.object({
  order: z.array(attachmentTurnStageSchema).min(1).max(10),
});

export type AttachmentTurnStagesConfig = z.infer<typeof attachmentTurnStagesConfigSchema>;

export const attachmentBehaviorConfigSchema = z.object({
  version: attachmentBehaviorConfigVersionSchema,
  safetyFloors: attachmentSafetyFloorsConfigSchema,
  categories: attachmentCategoriesConfigSchema,
  retention: attachmentRetentionConfigSchema,
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
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
          maxBytes: 10_000_000,
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
    },
    retention: {
      byCategory: {
        unclassified: "ephemeral_recognition",
        food_photo: "ephemeral_recognition",
        medical_document: "document_consent_rules",
        workout_attachment: "ephemeral_recognition",
      },
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
): { config: AttachmentBehaviorConfig; warnings: string[] } {
  const warnings: string[] = [];
  const next: AttachmentBehaviorConfig = {
    ...config,
    safetyFloors: { ...DEFAULT_ATTACHMENT_SAFETY_FLOORS },
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
    retention: {
      byCategory: {
        ...defaults.retention.byCategory,
        ...partial?.retention?.byCategory,
      },
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
    const { config, warnings } = applyAttachmentBehaviorSafetyFloors(normalized);

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
