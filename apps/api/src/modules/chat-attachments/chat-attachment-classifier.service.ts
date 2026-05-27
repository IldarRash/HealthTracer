import type {
  ChatAttachmentClassificationResult,
  ChatAttachmentRecord,
} from "@health/types";
import {
  chatAttachmentClassificationResultSchema,
  classifyAttachmentFromMessageContext,
} from "@health/types";
import { Injectable } from "@nestjs/common";

const MAX_MESSAGE_CONTEXT_CHARS = 500;

@Injectable()
export class ChatAttachmentClassifierService {
  classify(input: {
    message: string;
    attachment: Pick<ChatAttachmentRecord, "filename" | "mimeType">;
  }): ChatAttachmentClassificationResult {
    const boundedMessage = input.message.trim().slice(0, MAX_MESSAGE_CONTEXT_CHARS);

    return chatAttachmentClassificationResultSchema.parse(
      classifyAttachmentFromMessageContext({
        message: boundedMessage,
        filename: input.attachment.filename,
        mimeType: input.attachment.mimeType,
      }),
    );
  }
}
