import {
  createChatThreadSchema,
  sendChatMessageSchema,
} from "@health/types";
import type { ChatTurnStreamStageEvent } from "@health/types";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { ChatTurnStreamWriter, type StreamableResponse } from "./chat-turn-stream-writer.js";
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

  /**
   * Streaming variant of the send-message endpoint.
   *
   * Emits coarse stage-progress SSE events followed by ONE `final` event
   * carrying the exact same validated ChatTurnResponse that the sync endpoint
   * returns. Reply text and proposals are NEVER sent before validateReplySafety
   * and the full ProposalValidationService stack have completed (safety floor).
   *
   * Event sequence for a fan-out turn:
   *   turn_accepted → stage(preprocessing) → stage(routing) →
   *   stage(domains_running, selectedDomains=[...]) → stage(synthesis) →
   *   stage(validating) → final
   *
   * Pre-AI gate turns (crisis, direct-path, quota, no-proposal explainer) emit:
   *   turn_accepted → final  (no stage events)
   *
   * On error:
   *   turn_accepted (if persisted) → error  (generic copy, no internals)
   *
   * Client disconnect: writing stops but sendMessage continues to completion so
   * messages and proposals are always persisted regardless of stream state.
   *
   * Same auth guard and body DTO as POST :threadId/messages — compatible body.
   */
  @Post(":threadId/messages/stream")
  async sendMessageStream(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("threadId") threadId: string,
    @Body() body: unknown,
    @Res() res: StreamableResponse,
  ): Promise<void> {
    // Validate body BEFORE opening the SSE stream. parseBody throws a NestJS
    // BadRequestException on invalid input; that exception must propagate as a
    // normal HTTP 400 response — not as a half-opened SSE stream with a flushed
    // 200 status. Opening the stream is irreversible once flushHeaders() is called.
    const input = parseBody(sendChatMessageSchema, body);

    const writer = new ChatTurnStreamWriter(res);
    writer.open();

    // Emit turn_accepted immediately — the validated input is accepted and we will
    // persist the user message inside sendMessage.
    writer.writeTurnAccepted({ kind: "turn_accepted", threadId });

    // Build the progress reporter that forwards stage events to the SSE stream.
    const onProgress = (event: ChatTurnStreamStageEvent): void => {
      writer.writeEvent(event);
    };

    try {
      const response = await this.chatService.sendMessage(auth, threadId, input, onProgress);
      writer.writeFinal({ kind: "final", response });
    } catch (error) {
      const message =
        error instanceof Error
          ? "The chat turn could not be completed. Please try again."
          : "An unexpected error occurred. Please try again.";
      writer.writeError({ kind: "error", message });
    }
  }
}
