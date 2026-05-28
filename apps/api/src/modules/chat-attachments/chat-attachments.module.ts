import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AiBehaviorModule } from "../ai/ai-behavior.module.js";
import { AiBehaviorConfigService } from "../ai/ai-behavior-config.service.js";
import { ChatRepository } from "../chat/chat.repository.js";
import { NutritionModule } from "../nutrition/nutrition.module.js";
import { UsersModule } from "../users/users.module.js";
import { ChatAttachmentClassifierService } from "./chat-attachment-classifier.service.js";
import { ChatAttachmentRecognitionService } from "./chat-attachment-recognition.service.js";
import { ChatAttachmentsController } from "./chat-attachments.controller.js";
import { ChatAttachmentsRepository } from "./chat-attachments.repository.js";
import { ChatAttachmentsService } from "./chat-attachments.service.js";
import { ChatTurnAttachmentStageService } from "./chat-turn-attachment-stage.service.js";
import { LocalChatAttachmentClassificationProvider } from "./local-chat-attachment-classification.provider.js";
import { createChatAttachmentClassificationProvider } from "./chat-attachment-classification.factory.js";
import { FoodPhotoAttachmentRecognizer } from "./food-photo-attachment-recognizer.js";
import {
  LocalWorkoutAttachmentRecognitionProvider,
  WorkoutAttachmentRecognizer,
} from "./workout-attachment-recognizer.js";

@Module({
  imports: [DatabaseModule, UsersModule, NutritionModule, AiBehaviorModule],
  controllers: [ChatAttachmentsController],
  providers: [
    ChatRepository,
    ChatAttachmentsRepository,
    ChatAttachmentsService,
    ChatTurnAttachmentStageService,
    LocalChatAttachmentClassificationProvider,
    {
      provide: "CHAT_ATTACHMENT_CLASSIFICATION_PROVIDER",
      useFactory: createChatAttachmentClassificationProvider,
      inject: [AiBehaviorConfigService],
    },
    {
      provide: ChatAttachmentClassifierService,
      useFactory: (provider: ReturnType<typeof createChatAttachmentClassificationProvider>) =>
        new ChatAttachmentClassifierService(provider),
      inject: ["CHAT_ATTACHMENT_CLASSIFICATION_PROVIDER"],
    },
    ChatAttachmentRecognitionService,
    FoodPhotoAttachmentRecognizer,
    LocalWorkoutAttachmentRecognitionProvider,
    WorkoutAttachmentRecognizer,
  ],
  exports: [
    ChatAttachmentsService,
    ChatAttachmentsRepository,
    ChatAttachmentRecognitionService,
    ChatTurnAttachmentStageService,
  ],
})
export class ChatAttachmentsModule {}
