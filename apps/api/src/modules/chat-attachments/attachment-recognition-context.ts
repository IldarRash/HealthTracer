import type {
  AttachmentBehaviorConfig,
  ChatAttachmentCategory,
  ChatAttachmentRecognitionEnvelope,
  ChatAttachmentRecord,
} from "@health/types";
import type { ClerkAuthContext } from "../../auth.types.js";
import type { ChatAttachmentStorageAdapter } from "./local-chat-attachment-storage.js";

export type AttachmentContextCategory = Exclude<ChatAttachmentCategory, "unclassified">;

export type AttachmentRecognitionContextRequest = {
  auth: ClerkAuthContext;
  userId: string;
  attachment: ChatAttachmentRecord;
  category: AttachmentContextCategory;
  storage: ChatAttachmentStorageAdapter;
  messageContext?: {
    boundedMessage: string;
    mealContextLabel: string | null;
  };
  behavior?: AttachmentBehaviorConfig;
};

export type AttachmentRecognitionContextArtifact = {
  status: ChatAttachmentRecord["status"];
  recognition: ChatAttachmentRecognitionEnvelope | null;
  failureReason: string | null;
  linkedDocumentId: string | null;
  expiresAt: Date | null;
};

export interface AttachmentRecognitionContextPort {
  recognizeAttachmentContext(
    request: AttachmentRecognitionContextRequest,
  ): Promise<AttachmentRecognitionContextArtifact>;
}
