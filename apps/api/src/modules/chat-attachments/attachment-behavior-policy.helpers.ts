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

export function interpolateAttachmentTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
}
