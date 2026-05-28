import type {
  AttachmentBehaviorConfig,
  ChatAttachmentCategory,
  ChatAttachmentRecord,
  ChatAttachmentRetentionPolicy,
} from "@health/types";
import { compileAttachmentClassificationMatcher, isAttachmentContextOnlyMedicalRecognition } from "@health/types";

export function resolveAttachmentRetentionPolicyFromBehavior(
  category: ChatAttachmentCategory,
  behavior: AttachmentBehaviorConfig,
): ChatAttachmentRetentionPolicy {
  return behavior.retention.byCategory[category];
}

export function inferMealContextFromBehaviorConfig(
  message: string,
  behavior: AttachmentBehaviorConfig,
): string | null {
  return compileAttachmentClassificationMatcher(behavior.classification).inferMealContextFromMessage(
    message,
  );
}

export function interpolateAttachmentTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
}

export function buildEphemeralAttachmentExpiryFromBehavior(
  category: "food_photo" | "workout_attachment",
  behavior: AttachmentBehaviorConfig,
): Date {
  const hours = behavior.recognition.ephemeralExpiryHours[category];
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hours);
  return expiresAt;
}

function resolveCategoryCapabilityHint(
  category: ChatAttachmentCategory,
  behavior: AttachmentBehaviorConfig,
): string | null {
  if (category === "unclassified") {
    return null;
  }

  return behavior.routing.categoryToCapability[category] ?? behavior.routing.defaultCapabilityId;
}

export function resolveAttachmentContextCapabilityHint(
  category: ChatAttachmentCategory,
  behavior: AttachmentBehaviorConfig,
): string | null {
  return resolveCategoryCapabilityHint(category, behavior);
}

export function resolveAttachmentContextHint(
  attachment: ChatAttachmentRecord,
  behavior: AttachmentBehaviorConfig,
): string | null {
  if (attachment.category === "medical_document" && attachment.status === "needs_consent") {
    return behavior.outcomeHints.medicalNeedsConsent;
  }

  if (
    attachment.category === "medical_document" &&
    attachment.recognition?.category === "medical_document" &&
    isAttachmentContextOnlyMedicalRecognition(attachment.recognition)
  ) {
    return (
      behavior.outcomeHints.medicalContextOnly ?? behavior.outcomeHints.medicalNeedsReview
    );
  }

  if (attachment.category === "medical_document" && attachment.status === "needs_review") {
    return behavior.outcomeHints.medicalNeedsReview;
  }

  if (attachment.category === "unclassified" && attachment.status === "needs_review") {
    return behavior.outcomeHints.manualFallback;
  }

  if (attachment.category === "food_photo" && attachment.status === "low_confidence") {
    return behavior.outcomeHints.lowConfidenceFoodPhoto;
  }

  return null;
}
