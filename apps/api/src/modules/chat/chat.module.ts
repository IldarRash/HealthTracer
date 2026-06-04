import { Module, forwardRef } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AiModule } from "../ai/ai.module.js";
import { BillingModule } from "../billing/billing.module.js";
import { ChatAttachmentsModule } from "../chat-attachments/chat-attachments.module.js";
import { ProgressModule } from "../progress/progress.module.js";
import { ProposalsModule } from "../proposals/proposals.module.js";
import { RecipesModule } from "../recipes/recipes.module.js";
import { UsersModule } from "../users/users.module.js";
import { TodayModule } from "../today/today.module.js";
import { WellbeingCheckInsModule } from "../wellbeing-check-ins/wellbeing-check-ins.module.js";
import { ChatController } from "./chat.controller.js";
import { ChatRepository } from "./chat.repository.js";
import { ChatService } from "./chat.service.js";
import { DirectChatPathService } from "./direct-chat-path.service.js";
import { ProposalExplainerService } from "./proposal-explainer.service.js";

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    AiModule,
    BillingModule,
    ProposalsModule,
    ProgressModule,
    WellbeingCheckInsModule,
    RecipesModule,
    TodayModule,
    forwardRef(() => ChatAttachmentsModule),
  ],
  controllers: [ChatController],
  providers: [ChatRepository, DirectChatPathService, ProposalExplainerService, ChatService],
  exports: [ChatRepository, ChatService],
})
export class ChatModule {}
