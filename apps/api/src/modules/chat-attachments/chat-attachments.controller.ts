import {
  createChatAttachmentSchema,
  grantChatAttachmentConsentSchema,
} from "@health/types";
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { ChatAttachmentsService } from "./chat-attachments.service.js";

@Controller("chat/attachments")
@UseGuards(ClerkAuthGuard)
export class ChatAttachmentsController {
  constructor(private readonly chatAttachmentsService: ChatAttachmentsService) {}

  @Post()
  createAttachment(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.chatAttachmentsService.createAttachment(
      auth,
      parseBody(createChatAttachmentSchema, body),
    );
  }

  @Get(":attachmentId")
  getAttachment(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("attachmentId") attachmentId: string,
  ) {
    return this.chatAttachmentsService.getAttachment(auth, attachmentId);
  }

  @Get(":attachmentId/content")
  @Header("Cache-Control", "private, no-store")
  async getAttachmentContent(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("attachmentId") attachmentId: string,
  ) {
    const { content, mimeType } = await this.chatAttachmentsService.getAttachmentContent(
      auth,
      attachmentId,
    );

    return new StreamableFile(content, { type: mimeType });
  }

  @Post(":attachmentId/consent")
  grantConsent(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("attachmentId") attachmentId: string,
    @Body() body: unknown,
  ) {
    return this.chatAttachmentsService.grantConsent(
      auth,
      attachmentId,
      parseBody(grantChatAttachmentConsentSchema, body),
    );
  }

}
