import type {
  ChatAttachmentCategory,
  ChatAttachmentOutcome,
  ChatAttachmentStatus,
} from "@health/types";

/**
 * Bounded metadata for one attachment after the plumbing stages complete.
 * No recognition envelope — the router and domain LLMs read attachment
 * content directly as multimodal context.
 */
export type BoundedAttachmentMetadata = {
  refId: string;
  category: ChatAttachmentCategory;
  mimeType: string;
  consentState: "granted" | "needs_consent" | "none";
  storageRef: string | null;
};

/**
 * Result of running the plumbing stages (validate_refs -> link_to_message ->
 * apply_upload_disposition). No contextSummaries or recognition envelope.
 */
export type AttachmentTurnStageResult = {
  attachmentMetadata: BoundedAttachmentMetadata[];
  outcomes: ChatAttachmentOutcome[];
};

// Keep these for compatibility in code that still uses the old status type.
export type { ChatAttachmentCategory, ChatAttachmentStatus };
