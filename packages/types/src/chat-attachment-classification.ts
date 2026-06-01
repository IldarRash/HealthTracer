import { z } from "zod";
import {
  recognitionConfidenceBandSchema,
} from "./chat-attachments.js";

import {
  chatAttachmentCategorySchema,
  classifiedChatAttachmentCategorySchema,
} from "./chat-attachments.js";

export type ClassifiedChatAttachmentCategory = z.infer<
  typeof classifiedChatAttachmentCategorySchema
>;

export const chatAttachmentClassificationMethodSchema = z.enum([
  "user_selected",
  "dev_heuristic",
  "vision",
  "text_excerpt",
  "metadata_only",
]);

export type ChatAttachmentClassificationMethod = z.infer<
  typeof chatAttachmentClassificationMethodSchema
>;

export const chatAttachmentClassificationSuggestedActionSchema = z.enum([
  "run_category_recognition",
  "request_medical_consent",
  "manual_fallback",
  "unsupported",
]);

export type ChatAttachmentClassificationSuggestedAction = z.infer<
  typeof chatAttachmentClassificationSuggestedActionSchema
>;

export const chatAttachmentClassificationResultSchema = z
  .object({
    category: chatAttachmentCategorySchema,
    confidence: recognitionConfidenceBandSchema,
    rationale: z.string().min(1).max(500),
    suggestedAction: chatAttachmentClassificationSuggestedActionSchema,
    mealContextLabel: z.string().min(1).max(120).nullable().optional(),
    classificationProviderId: z.string().min(1).max(80).optional(),
    classificationMethod: chatAttachmentClassificationMethodSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const requiresCategory =
      value.suggestedAction === "run_category_recognition" ||
      value.suggestedAction === "request_medical_consent";

    if (requiresCategory && value.category === "unclassified") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Routed attachment classifications must specify a concrete category.",
        path: ["category"],
      });
    }

    if (
      (value.suggestedAction === "manual_fallback" ||
        value.suggestedAction === "unsupported") &&
      value.category !== "unclassified"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Manual fallback classifications must remain unclassified.",
        path: ["category"],
      });
    }
  });

export type ChatAttachmentClassificationResult = z.infer<
  typeof chatAttachmentClassificationResultSchema
>;

