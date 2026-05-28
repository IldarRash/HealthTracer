import type {
  ChatAttachmentCategory,
  ChatAttachmentOutcome,
  ChatAttachmentRecord,
  ChatAttachmentStatus,
} from "@health/types";

export type AttachmentContextSummary = {
  attachmentRefId: string;
  category: ChatAttachmentCategory;
  status: ChatAttachmentStatus;
  routingCapabilityId: string | null;
  contextHint: string | null;
  recognitionPresent: boolean;
};

export type AttachmentTurnStageResult = {
  attachments: ChatAttachmentRecord[];
  contextSummaries: AttachmentContextSummary[];
  outcomes: ChatAttachmentOutcome[];
};
