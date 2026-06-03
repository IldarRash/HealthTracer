import type {
  DirectChatPathCandidate,
  DirectChatPathMetadata,
  DirectChatPathOutcome,
  SendChatMessageInput,
  TodayChecklistItem,
} from "@health/types";
import {
  getTodayIsoDateInTimezone,
  resolveDirectPathRefreshHintsFromConfig,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { AiBehaviorConfigService } from "../ai/ai-behavior-config.service.js";
import { SystemPlannerService } from "../ai/system-planner.service.js";
import { TodayService } from "../today/today.service.js";
import { UsersService } from "../users/users.service.js";
import {
  formatTodaySummaryReadMessage,
  formatWorkoutMarkedDoneMessage,
} from "./direct-chat-path-formatters.js";

export interface DirectChatPathExecuteInput {
  auth: ClerkAuthContext;
  userMessage: string;
  proposalRevision?: SendChatMessageInput["proposalRevision"];
  hasAttachments: boolean;
}

export interface DirectChatPathExecuteResult {
  reply: string;
  metadata: DirectChatPathMetadata;
}

@Injectable()
export class DirectChatPathService {
  constructor(
    private readonly systemPlannerService: SystemPlannerService,
    private readonly aiBehaviorConfigService: AiBehaviorConfigService,
    private readonly todayService: TodayService,
    private readonly usersService: UsersService,
  ) {}

  async tryExecute(
    input: DirectChatPathExecuteInput,
  ): Promise<DirectChatPathExecuteResult | null> {
    const candidate = this.resolveCandidate(input);

    if (!candidate) {
      return null;
    }

    const replyTemplates = this.aiBehaviorConfigService.getDirectPaths().replyTemplates;
    const outcome = await this.executeCandidate(input.auth, candidate, replyTemplates);

    return {
      reply: outcome.message ?? "",
      metadata: {
        candidate,
        outcome,
      },
    };
  }

  private resolveCandidate(
    input: DirectChatPathExecuteInput,
  ): DirectChatPathCandidate | null {
    return this.systemPlannerService.classifyDirectPathCandidate({
      userMessage: input.userMessage,
      proposalRevision: input.proposalRevision,
      attachmentTurn: input.hasAttachments
        ? {
            attachments: [
              {
                attachmentRefId: "direct-path-blocked",
                category: "unclassified",
                mimeType: "application/octet-stream",
                consentState: "none",
                storageRef: null,
              },
            ],
          }
        : undefined,
    });
  }

  private async executeCandidate(
    auth: ClerkAuthContext,
    candidate: DirectChatPathCandidate,
    replyTemplates: ReturnType<AiBehaviorConfigService["getDirectPaths"]>["replyTemplates"],
  ): Promise<DirectChatPathOutcome> {
    switch (candidate.kind) {
      case "today_summary_read":
        return this.executeTodaySummaryRead(auth, candidate.kind, replyTemplates);
      case "mark_today_workout_done":
        return this.executeMarkTodayWorkoutDone(auth, candidate.kind, replyTemplates);
      default: {
        const _exhaustive: never = candidate.kind;
        return _exhaustive;
      }
    }
  }

  private async executeTodaySummaryRead(
    auth: ClerkAuthContext,
    kind: DirectChatPathCandidate["kind"],
    replyTemplates: ReturnType<AiBehaviorConfigService["getDirectPaths"]>["replyTemplates"],
  ): Promise<DirectChatPathOutcome> {
    const user = await this.usersService.resolveFromAuth(auth);
    const todayIsoDate = getTodayIsoDateInTimezone(user.timezone);
    const day = await this.todayService.getOrGenerateDay(auth, todayIsoDate);
    const status = "executed" as const;

    return {
      kind,
      status,
      message: formatTodaySummaryReadMessage(day, todayIsoDate, replyTemplates),
      refreshHints: this.resolveRefreshHints(kind, status),
    };
  }

  private async executeMarkTodayWorkoutDone(
    auth: ClerkAuthContext,
    kind: DirectChatPathCandidate["kind"],
    replyTemplates: ReturnType<AiBehaviorConfigService["getDirectPaths"]>["replyTemplates"],
  ): Promise<DirectChatPathOutcome> {
    const user = await this.usersService.resolveFromAuth(auth);
    const todayIsoDate = getTodayIsoDateInTimezone(user.timezone);
    const day = await this.todayService.getOrGenerateDay(auth, todayIsoDate);
    const pendingWorkoutItems = findPendingWorkoutItems(day.items);

    if (pendingWorkoutItems.length === 0) {
      return {
        kind,
        status: "clarification_required",
        message: replyTemplates.markWorkoutDone.noPendingWorkoutMessage,
        refreshHints: [],
      };
    }

    if (pendingWorkoutItems.length > 1) {
      return {
        kind,
        status: "clarification_required",
        message: replyTemplates.markWorkoutDone.multiplePendingWorkoutsMessage,
        refreshHints: [],
      };
    }

    const targetItem = pendingWorkoutItems[0]!;
    await this.todayService.updateItemStatus(auth, todayIsoDate, targetItem.id, {
      status: "completed",
    });
    const status = "executed" as const;

    return {
      kind,
      status,
      message: formatWorkoutMarkedDoneMessage(targetItem.label, replyTemplates),
      refreshHints: this.resolveRefreshHints(kind, status),
    };
  }

  private resolveRefreshHints(
    kind: DirectChatPathCandidate["kind"],
    outcomeStatus: DirectChatPathOutcome["status"],
  ) {
    return resolveDirectPathRefreshHintsFromConfig(
      this.aiBehaviorConfigService.getDirectPaths(),
      kind,
      outcomeStatus,
    );
  }
}

function findPendingWorkoutItems(items: TodayChecklistItem[]): TodayChecklistItem[] {
  return items.filter((item) => item.kind === "workout" && item.status === "pending");
}
