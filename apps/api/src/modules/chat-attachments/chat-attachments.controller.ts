import {
  createChatAttachmentSchema,
  grantChatAttachmentConsentSchema,
  recognizeChatAttachmentSchema,
} from "@health/types";
import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
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

  @Post(":attachmentId/recognize")
  recognizeAttachment(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("attachmentId") attachmentId: string,
    @Body() body: unknown,
  ) {
    return this.chatAttachmentsService.recognizeAttachment(
      auth,
      attachmentId,
      parseBody(recognizeChatAttachmentSchema, body),
    );
  }
}
