import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { ChatRepository } from "../chat/chat.repository.js";
import { DocumentsModule } from "../documents/documents.module.js";
import { NutritionModule } from "../nutrition/nutrition.module.js";
import { UsersModule } from "../users/users.module.js";
import { ChatAttachmentClassifierService } from "./chat-attachment-classifier.service.js";
import { ChatAttachmentRecognitionService } from "./chat-attachment-recognition.service.js";
import { ChatAttachmentsController } from "./chat-attachments.controller.js";
import { ChatAttachmentsRepository } from "./chat-attachments.repository.js";
import { ChatAttachmentsService } from "./chat-attachments.service.js";
import { DevChatAttachmentClassificationProvider } from "./dev-chat-attachment-classification.provider.js";
import { createChatAttachmentClassificationProvider } from "./chat-attachment-classification.factory.js";
import { FoodPhotoAttachmentRecognizer } from "./food-photo-attachment-recognizer.js";
import { MedicalDocumentAttachmentRecognizer } from "./medical-document-attachment-recognizer.js";
import {
  DevWorkoutAttachmentRecognitionProvider,
  WorkoutAttachmentRecognizer,
} from "./workout-attachment-recognizer.js";

@Module({
  imports: [DatabaseModule, UsersModule, NutritionModule, DocumentsModule],
  controllers: [ChatAttachmentsController],
  providers: [
    ChatRepository,
    ChatAttachmentsRepository,
    ChatAttachmentsService,
    DevChatAttachmentClassificationProvider,
    {
      provide: "CHAT_ATTACHMENT_CLASSIFICATION_PROVIDER",
      useFactory: createChatAttachmentClassificationProvider,
    },
    {
      provide: ChatAttachmentClassifierService,
      useFactory: (provider: ReturnType<typeof createChatAttachmentClassificationProvider>) =>
        new ChatAttachmentClassifierService(provider),
      inject: ["CHAT_ATTACHMENT_CLASSIFICATION_PROVIDER"],
    },
    ChatAttachmentRecognitionService,
    FoodPhotoAttachmentRecognizer,
    MedicalDocumentAttachmentRecognizer,
    DevWorkoutAttachmentRecognitionProvider,
    WorkoutAttachmentRecognizer,
  ],
  exports: [ChatAttachmentsService, ChatAttachmentsRepository, ChatAttachmentRecognitionService],
})
export class ChatAttachmentsModule {}
