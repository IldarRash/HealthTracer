import { Module, forwardRef } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AiModule } from "../ai/ai.module.js";
import { ChatAttachmentsModule } from "../chat-attachments/chat-attachments.module.js";
import { ProgressModule } from "../progress/progress.module.js";
import { ProposalsModule } from "../proposals/proposals.module.js";
import { RecipesModule } from "../recipes/recipes.module.js";
import { UsersModule } from "../users/users.module.js";
import { WellbeingCheckInsModule } from "../wellbeing-check-ins/wellbeing-check-ins.module.js";
import { ChatController } from "./chat.controller.js";
import { ChatRepository } from "./chat.repository.js";
import { ChatService } from "./chat.service.js";

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    AiModule,
    ProposalsModule,
    ProgressModule,
    WellbeingCheckInsModule,
    RecipesModule,
    forwardRef(() => ChatAttachmentsModule),
  ],
  controllers: [ChatController],
  providers: [ChatRepository, ChatService],
  exports: [ChatRepository, ChatService],
})
export class ChatModule {}
