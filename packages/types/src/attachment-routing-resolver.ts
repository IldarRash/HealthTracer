import type { AttachmentCatalogIntentId } from "./agent-context.js";
import type { ClassifiedChatAttachmentCategory } from "./chat-attachment-classification.js";

export type AttachmentRoutingPolicy = {
  categoryPriority: ReadonlyArray<ClassifiedChatAttachmentCategory>;
  categoryToCapability: Record<
    ClassifiedChatAttachmentCategory,
    AttachmentCatalogIntentId
  >;
  defaultCapabilityId: AttachmentCatalogIntentId;
};

export const DEFAULT_ATTACHMENT_ROUTING_POLICY: AttachmentRoutingPolicy = {
  categoryPriority: ["medical_document", "workout_attachment", "food_photo"],
  categoryToCapability: {
    food_photo: "attachment_food_photo",
    workout_attachment: "attachment_workout",
    medical_document: "attachment_medical_document",
  },
  defaultCapabilityId: "attachment_food_photo",
};

export function resolvePrimaryAttachmentCatalogIntentFromRouting(
  routing: AttachmentRoutingPolicy,
  categories: ReadonlyArray<ClassifiedChatAttachmentCategory>,
): AttachmentCatalogIntentId {
  for (const category of routing.categoryPriority) {
    if (categories.includes(category)) {
      return routing.categoryToCapability[category];
    }
  }

  return routing.defaultCapabilityId;
}
