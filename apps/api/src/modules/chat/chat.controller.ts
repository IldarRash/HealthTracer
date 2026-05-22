import {
  createChatThreadSchema,
  sendChatMessageSchema,
} from "@health/types";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { ChatService } from "./chat.service.js";

@Controller("chat/threads")
@UseGuards(ClerkAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  listThreads(@CurrentAuth() auth: ClerkAuthContext) {
    return this.chatService.listThreads(auth);
  }

  @Post()
  createThread(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.chatService.createThread(auth, parseBody(createChatThreadSchema, body));
  }

  @Get(":threadId")
  getThread(@CurrentAuth() auth: ClerkAuthContext, @Param("threadId") threadId: string) {
    return this.chatService.getThread(auth, threadId);
  }

  @Post(":threadId/messages")
  sendMessage(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("threadId") threadId: string,
    @Body() body: unknown,
  ) {
    return this.chatService.sendMessage(
      auth,
      threadId,
      parseBody(sendChatMessageSchema, body),
    );
  }
}
