import type {
  AttachmentBehaviorConfig,
  ChatAttachmentCategory,
  ChatAttachmentRetentionPolicy,
} from "@health/types";

export function resolveAttachmentRetentionPolicyFromBehavior(
  category: ChatAttachmentCategory,
  behavior: AttachmentBehaviorConfig,
): ChatAttachmentRetentionPolicy {
  return behavior.retention.byCategory[category];
}

