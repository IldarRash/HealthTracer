import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { AiModule } from "../ai/ai.module.js";
import { ProgressModule } from "../progress/progress.module.js";
import { ProposalsModule } from "../proposals/proposals.module.js";
import { UsersModule } from "../users/users.module.js";
import { ChatController } from "./chat.controller.js";
import { ChatRepository } from "./chat.repository.js";
import { ChatService } from "./chat.service.js";

@Module({
  imports: [DatabaseModule, UsersModule, AiModule, ProposalsModule, ProgressModule],
  controllers: [ChatController],
  providers: [ChatRepository, ChatService],
  exports: [ChatRepository, ChatService],
})
export class ChatModule {}
