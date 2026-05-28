import { z } from "zod";
import { interpolateBehaviorTemplate } from "./behavior-template.js";
import {
  attachmentRoutingConfigSchema,
  regexPatternRuleSchema,
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
  "classify",
  "apply_upload_disposition",
  "recognize",
  "prepare_attachment_context",
]);

export type AttachmentTurnStage = z.infer<typeof attachmentTurnStageSchema>;

export const DEFAULT_ATTACHMENT_TURN_STAGE_ORDER: readonly AttachmentTurnStage[] = [
  "validate_refs",
  "link_to_message",
  "classify",
  "apply_upload_disposition",
  "recognize",
  "prepare_attachment_context",
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

export const attachmentMealContextPatternSchema = z.object({
  pattern: regexPatternRuleSchema,
  label: z.string().min(1).max(80),
});

export type AttachmentMealContextPattern = z.infer<typeof attachmentMealContextPatternSchema>;

export const attachmentClassificationRationalesSchema = z.object({
  medicalImageConsent: z.string().min(1).max(500),
  medicalDocumentUpload: z.string().min(1).max(500),
  workoutAttachment: z.string().min(1).max(500),
  foodPhoto: z.string().min(1).max(500),
  userSelectedMedicalConsent: z.string().min(1).max(500),
  userSelectedCategory: z.string().min(1).max(500),
  healthDocumentMimeOnly: z.string().min(1).max(500),
  workoutMimeOnly: z.string().min(1).max(500),
  ambiguousContext: z.string().min(1).max(500),
  devPdfManualFallback: z.string().min(1).max(500),
  devAmbiguousManualFallback: z.string().min(1).max(500),
});

export type AttachmentClassificationRationales = z.infer<
  typeof attachmentClassificationRationalesSchema
>;

export const attachmentClassificationConfigSchema = z.object({
  llmClassifierPrompt: z.string().min(1).max(20_000),
  llmUserPromptIntro: z.string().min(1).max(2_000),
  preferManualFallbackOverFoodGuess: z.boolean().default(true),
  maxTextClassificationChars: z.number().int().min(1_000).max(50_000).default(8_000),
  mealContextPatterns: z.array(attachmentMealContextPatternSchema).min(1).max(30),
  foodMessageSignal: regexPatternRuleSchema,
  workoutMessageSignal: regexPatternRuleSchema,
  medicalMessagePatterns: z.array(regexPatternRuleSchema).min(1).max(20),
  medicalFilenamePatterns: z.array(regexPatternRuleSchema).min(1).max(20),
  workoutFilenamePatterns: z.array(regexPatternRuleSchema).min(1).max(20),
  todayWorkoutContextPattern: regexPatternRuleSchema,
  todayWorkoutActionPattern: regexPatternRuleSchema,
  todayWorkoutNounPattern: regexPatternRuleSchema,
  todayWorkoutSportPattern: regexPatternRuleSchema,
  rationales: attachmentClassificationRationalesSchema,
});

export type AttachmentClassificationConfig = z.infer<typeof attachmentClassificationConfigSchema>;

export const attachmentRecognitionPromptsSchema = z.object({
  foodPhoto: z.object({
    instructionBase: z.string().min(1).max(2_000),
    mealContextLineTemplate: z.string().min(1).max(500),
    boundedMessageLineTemplate: z.string().min(1).max(500),
  }),
  medicalDocument: z.object({
    wellnessContextOnlyNotice: z.string().min(1).max(1_000),
  }),
});

export type AttachmentRecognitionPrompts = z.infer<typeof attachmentRecognitionPromptsSchema>;

export const attachmentDevStubExerciseSchema = z.object({
  name: z.string().min(1).max(120),
  target: z.string().min(1).max(80),
  sets: z.number().int().min(1).max(20),
  reps: z.string().min(1).max(40),
  notes: z.string().min(1).max(500).optional(),
});

export type AttachmentDevStubExercise = z.infer<typeof attachmentDevStubExerciseSchema>;

export const attachmentWorkoutDevStubConfigSchema = z.object({
  sessionLabelVolleyball: z.string().min(1).max(120),
  sessionLabelDefault: z.string().min(1).max(120),
  planDraftTitle: z.string().min(1).max(200),
  manualFallbackNoticeLowConfidence: z.string().min(1).max(500),
  planExercises: z.array(attachmentDevStubExerciseSchema).min(1).max(10),
  photoExercises: z.array(attachmentDevStubExerciseSchema).min(1).max(10),
});

export type AttachmentWorkoutDevStubConfig = z.infer<typeof attachmentWorkoutDevStubConfigSchema>;

export const attachmentRecognitionDevStubConfigSchema = z.object({
  workout_attachment: attachmentWorkoutDevStubConfigSchema,
});

export type AttachmentRecognitionDevStubConfig = z.infer<
  typeof attachmentRecognitionDevStubConfigSchema
>;

export const attachmentRecognitionConfigSchema = z.object({
  recognizerIds: z.object({
    food_photo: z.string().min(1).max(80),
    workout_attachment: z.string().min(1).max(80),
    medical_document: z.string().min(1).max(80),
  }),
  ephemeralExpiryHours: z.object({
    food_photo: z.number().int().min(1).max(168).default(24),
    workout_attachment: z.number().int().min(1).max(168).default(24),
  }),
  prompts: attachmentRecognitionPromptsSchema,
  devStub: attachmentRecognitionDevStubConfigSchema,
});

export type AttachmentRecognitionConfig = z.infer<typeof attachmentRecognitionConfigSchema>;

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
  classification: attachmentClassificationConfigSchema,
  recognition: attachmentRecognitionConfigSchema,
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

const DEFAULT_MEAL_CONTEXT_PATTERNS: AttachmentMealContextPattern[] = [
  { pattern: { source: String.raw`\b(second|2nd)\s+meal\b`, flags: "i" }, label: "Second meal" },
  { pattern: { source: String.raw`\bthird\s+meal\b`, flags: "i" }, label: "Third meal" },
  { pattern: { source: String.raw`\b(first|1st)\s+meal\b`, flags: "i" }, label: "First meal" },
  { pattern: { source: String.raw`\bbreakfast\b`, flags: "i" }, label: "Breakfast" },
  { pattern: { source: String.raw`\blunch\b`, flags: "i" }, label: "Lunch" },
  { pattern: { source: String.raw`\bdinner\b`, flags: "i" }, label: "Dinner" },
  { pattern: { source: String.raw`\bsnack\b`, flags: "i" }, label: "Snack" },
  {
    pattern: { source: String.raw`второй\s+при[её]м\s+пищи`, flags: "i" },
    label: "Second meal",
  },
  {
    pattern: { source: String.raw`третий\s+при[её]м\s+пищи`, flags: "i" },
    label: "Third meal",
  },
  {
    pattern: { source: String.raw`первый\s+при[её]м\s+пищи`, flags: "i" },
    label: "First meal",
  },
  { pattern: { source: String.raw`\bзавтрак\b`, flags: "i" }, label: "Breakfast" },
  { pattern: { source: String.raw`\bобед\b`, flags: "i" }, label: "Lunch" },
  { pattern: { source: String.raw`\bужин\b`, flags: "i" }, label: "Dinner" },
  { pattern: { source: String.raw`\bперекус\b`, flags: "i" }, label: "Snack" },
];

const DEFAULT_CLASSIFICATION_RATIONALES: AttachmentClassificationRationales = {
  medicalImageConsent:
    "Message or filename suggests a medical document screenshot; consent is required before review.",
  medicalDocumentUpload: "Message or filename suggests a health document upload.",
  workoutAttachment: "Message or filename suggests a training or activity attachment.",
  foodPhoto: "Message context suggests a food photo for nutrition logging.",
  userSelectedMedicalConsent:
    "User selected a medical document attachment; explicit consent is required.",
  userSelectedCategory: "User selected attachment category before send.",
  healthDocumentMimeOnly:
    "Health document file type cannot be classified from MIME alone; message context or vision classification is required.",
  workoutMimeOnly: "Training file type suggests workout attachment recognition.",
  ambiguousContext:
    "Could not determine attachment category from message context alone; vision classification is required.",
  devPdfManualFallback:
    "Document file type cannot be classified from MIME alone in local dev mode; vision or message context is required.",
  devAmbiguousManualFallback:
    "Could not determine attachment category from the image and message context. Ask the user to clarify or choose a category.",
};

const DEFAULT_ATTACHMENT_RECOGNITION_PROMPTS: AttachmentRecognitionPrompts = {
  foodPhoto: {
    instructionBase: "Estimate meal items and macros from this food photo.",
    mealContextLineTemplate: "Meal context: {{mealContextLabel}}.",
    boundedMessageLineTemplate: "User message (bounded): {{boundedMessage}}",
  },
  medicalDocument: {
    wellnessContextOnlyNotice:
      "This attachment is wellness coaching context only. It has not been saved or parsed as a health document.",
  },
};

const DEFAULT_WORKOUT_DEV_STUB_EXERCISE_NOTES =
  "Review extracted values before confirming.";

const DEFAULT_WORKOUT_DEV_STUB: AttachmentWorkoutDevStubConfig = {
  sessionLabelVolleyball: "Volleyball training",
  sessionLabelDefault: "Recognized training session",
  planDraftTitle: "Imported workout plan draft",
  manualFallbackNoticeLowConfidence:
    "Recognition confidence is low. Edit exercises or describe the workout in text.",
  planExercises: [
    {
      name: "Barbell squat",
      target: "3 sets",
      sets: 3,
      reps: "8-10",
      notes: DEFAULT_WORKOUT_DEV_STUB_EXERCISE_NOTES,
    },
    {
      name: "Romanian deadlift",
      target: "3 sets",
      sets: 3,
      reps: "10-12",
    },
  ],
  photoExercises: [
    {
      name: "Dumbbell row",
      target: "3 sets",
      sets: 3,
      reps: "8-10",
      notes: DEFAULT_WORKOUT_DEV_STUB_EXERCISE_NOTES,
    },
    {
      name: "Push-up",
      target: "3 sets",
      sets: 3,
      reps: "10-12",
    },
  ],
};

const DEFAULT_LLM_CLASSIFIER_PROMPT = [
  "You classify wellness coaching chat attachments.",
  "Return JSON only. Do not answer the user or provide coaching advice.",
  "Allowed categories: food_photo, workout_attachment, medical_document.",
  "Allowed suggestedAction values: run_category_recognition, request_medical_consent, manual_fallback, unsupported.",
  "Use request_medical_consent for medical_document when explicit consent would be required before review.",
  "Use manual_fallback when the attachment is ambiguous, unrelated, or low confidence.",
  "Never default ambiguous images to food_photo. Prefer manual_fallback over guessing nutrition.",
  "Allowed JSON shape:",
  '{"category":"food_photo|workout_attachment|medical_document","confidence":"low|medium|high","rationale":"short reason","suggestedAction":"run_category_recognition|request_medical_consent|manual_fallback|unsupported","mealContextLabel":null|string}',
  "mealContextLabel is optional and only for food_photo when meal timing is evident from the message.",
].join("\n");

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
    classification: {
      llmClassifierPrompt: DEFAULT_LLM_CLASSIFIER_PROMPT,
      llmUserPromptIntro:
        "Classify this chat attachment into exactly one allowed category.\nAllowed categories: food_photo, workout_attachment, medical_document.",
      preferManualFallbackOverFoodGuess: true,
      maxTextClassificationChars: 8_000,
      mealContextPatterns: DEFAULT_MEAL_CONTEXT_PATTERNS,
      foodMessageSignal: {
        source: String.raw`\b(meal|food|ate|eating|lunch|dinner|breakfast|snack|nutrition|calories|при[её]м\s+пищи|еда|обед|ужин|завтрак)\b`,
        flags: "i",
      },
      workoutMessageSignal: {
        source: String.raw`\b(workout|training|exercise|exercises|session|activity|activities|gym|lift|lifting|cardio|volleyball|sport|sports|fitness|athletic|running|yoga|crossfit|drill|practice|match|game|court|field|тренировк|активност|упражнен|заполни\s+активност|волейбол|спорт|фитнес)\b`,
        flags: "i",
      },
      medicalMessagePatterns: [
        { source: String.raw`\b(lab|labs)\s+results?\b`, flags: "i" },
        { source: String.raw`\bblood\s+(test|report|results?)\b`, flags: "i" },
        { source: String.raw`\b(medical|health)\s+(document|report|record|doc)\b`, flags: "i" },
        { source: String.raw`\b(lab|labs|blood|medical|report|results)\b`, flags: "i" },
        { source: String.raw`анализы`, flags: "i" },
        { source: String.raw`мед\s*документ`, flags: "i" },
        { source: String.raw`медицин`, flags: "i" },
        { source: String.raw`анализ`, flags: "i" },
        { source: String.raw`\bдокумент\b`, flags: "i" },
      ],
      medicalFilenamePatterns: [
        { source: String.raw`\b(lab|labs|blood|report|medical|health)\b`, flags: "i" },
        { source: String.raw`анализ`, flags: "i" },
        { source: String.raw`мед`, flags: "i" },
      ],
      workoutFilenamePatterns: [
        {
          source: String.raw`\b(workout|training|plan|session|gym|exercise|sport|sports|fitness|volleyball|volley|cardio|crossfit|yoga|athletic|drill|practice|match|run|running)\b`,
          flags: "i",
        },
        { source: String.raw`тренировк`, flags: "i" },
      ],
      todayWorkoutContextPattern: {
        source: String.raw`\b(?:today|for\s+today|this\s+morning|tonight)\b|(?:на\s+)?сегодня`,
        flags: "i",
      },
      todayWorkoutActionPattern: {
        source: String.raw`\b(?:log|add|record|schedule|write|track|save)\b|(?:запиш\w*|добав\w*|внес\w*|залогиру\w*)`,
        flags: "i",
      },
      todayWorkoutNounPattern: {
        source: String.raw`\b(?:workout|training|session|activity|exercise)s?\b|(?:тренировк\w*|активност\w*|упражнен\w*)`,
        flags: "i",
      },
      todayWorkoutSportPattern: {
        source: String.raw`(?:волейбол|volleyball)`,
        flags: "i",
      },
      rationales: DEFAULT_CLASSIFICATION_RATIONALES,
    },
    recognition: {
      recognizerIds: {
        food_photo: "food_photo_attachment_recognizer",
        workout_attachment: "workout_attachment_recognizer",
        medical_document: "medical_document_attachment_recognizer",
      },
      ephemeralExpiryHours: {
        food_photo: 24,
        workout_attachment: 24,
      },
      prompts: DEFAULT_ATTACHMENT_RECOGNITION_PROMPTS,
      devStub: {
        workout_attachment: DEFAULT_WORKOUT_DEV_STUB,
      },
    },
    routing: {
      categoryPriority: ["medical_document", "workout_attachment", "food_photo"],
      categoryToCapability: {
        food_photo: "attachment_food_photo",
        workout_attachment: "attachment_workout",
        medical_document: "attachment_medical_document",
      },
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
    classification: {
      ...defaults.classification,
      ...partial?.classification,
      mealContextPatterns:
        partial?.classification?.mealContextPatterns ?? defaults.classification.mealContextPatterns,
      medicalMessagePatterns:
        partial?.classification?.medicalMessagePatterns ??
        defaults.classification.medicalMessagePatterns,
      medicalFilenamePatterns:
        partial?.classification?.medicalFilenamePatterns ??
        defaults.classification.medicalFilenamePatterns,
      workoutFilenamePatterns:
        partial?.classification?.workoutFilenamePatterns ??
        defaults.classification.workoutFilenamePatterns,
      rationales: {
        ...defaults.classification.rationales,
        ...partial?.classification?.rationales,
      },
    },
    recognition: {
      ...defaults.recognition,
      ...partial?.recognition,
      recognizerIds: {
        ...defaults.recognition.recognizerIds,
        ...partial?.recognition?.recognizerIds,
      },
      ephemeralExpiryHours: {
        ...defaults.recognition.ephemeralExpiryHours,
        ...partial?.recognition?.ephemeralExpiryHours,
      },
      prompts: {
        foodPhoto: {
          ...defaults.recognition.prompts.foodPhoto,
          ...partial?.recognition?.prompts?.foodPhoto,
        },
        medicalDocument: {
          ...defaults.recognition.prompts.medicalDocument,
          ...partial?.recognition?.prompts?.medicalDocument,
        },
      },
      devStub: {
        workout_attachment: {
          ...defaults.recognition.devStub.workout_attachment,
          ...partial?.recognition?.devStub?.workout_attachment,
          planExercises:
            partial?.recognition?.devStub?.workout_attachment?.planExercises ??
            defaults.recognition.devStub.workout_attachment.planExercises,
          photoExercises:
            partial?.recognition?.devStub?.workout_attachment?.photoExercises ??
            defaults.recognition.devStub.workout_attachment.photoExercises,
        },
      },
    },
    routing: {
      ...defaults.routing,
      ...partial?.routing,
      categoryToCapability: {
        ...defaults.routing.categoryToCapability,
        ...partial?.routing?.categoryToCapability,
      },
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

export function buildFoodPhotoRecognitionInstruction(input: {
  prompts: AttachmentRecognitionPrompts["foodPhoto"];
  mealContextLabel?: string | null;
  boundedMessage?: string;
}): string {
  const parts = [input.prompts.instructionBase];

  if (input.mealContextLabel) {
    parts.push(
      interpolateBehaviorTemplate(input.prompts.mealContextLineTemplate, {
        mealContextLabel: input.mealContextLabel,
      }),
    );
  }

  if (input.boundedMessage) {
    parts.push(
      interpolateBehaviorTemplate(input.prompts.boundedMessageLineTemplate, {
        boundedMessage: input.boundedMessage.slice(0, 200),
      }),
    );
  }

  return parts.join(" ");
}
