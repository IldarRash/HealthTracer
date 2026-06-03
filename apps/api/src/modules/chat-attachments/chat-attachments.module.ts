import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AiBehaviorModule } from "../ai/ai-behavior.module.js";
import { ChatRepository } from "../chat/chat.repository.js";
import { UsersModule } from "../users/users.module.js";
import { ChatAttachmentsController } from "./chat-attachments.controller.js";
import { ChatAttachmentsRepository } from "./chat-attachments.repository.js";
import { ChatAttachmentsService } from "./chat-attachments.service.js";
import { ChatTurnAttachmentStageService } from "./chat-turn-attachment-stage.service.js";

@Module({
  imports: [DatabaseModule, UsersModule, AiBehaviorModule],
  controllers: [ChatAttachmentsController],
  providers: [
    ChatRepository,
    ChatAttachmentsRepository,
    ChatAttachmentsService,
    ChatTurnAttachmentStageService,
  ],
  exports: [
    ChatAttachmentsService,
    ChatAttachmentsRepository,
    ChatTurnAttachmentStageService,
  ],
})
export class ChatAttachmentsModule {}
