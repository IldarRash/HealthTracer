import type {
  TodayChecklistPayload,
  TodayDayResponse,
  TodayHistoryResponse,
  UpdateTodayFeedbackInput,
  UpdateTodayItemStatusInput,
  WorkoutSession,
} from "@health/types";
import { isoDateSchema, workoutCompletionFeedbackSchema } from "@health/types";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { UsersService } from "../users/users.service.js";
import { WorkoutsRepository } from "../workouts/workouts.repository.js";
import {
  applyItemStatusUpdate,
  buildChecklistState,
  findWorkoutSessionIdForItem,
  mergeProposalItemsWithExisting,
  mergeWorkoutSessionsIntoItems,
  normalizeProposalItems,
} from "./today-items.js";
import {
  adherenceScoreValue,
  toTodayChecklistRecord,
  toTodayHistoryEntry,
} from "./today.mapper.js";
import { TodayRepository } from "./today.repository.js";

@Injectable()
export class TodayService {
  constructor(
    private readonly todayRepository: TodayRepository,
    private readonly workoutsRepository: WorkoutsRepository,
    private readonly usersService: UsersService,
  ) {}

  async getOrGenerateDay(auth: ClerkAuthContext, dateInput: string): Promise<TodayDayResponse> {
    const date = this.parseDate(dateInput);
    const user = await this.usersService.resolveFromAuth(auth);
    const sessions = await this.workoutsRepository.listSessionsByUserAndPlannedDate(
      user.id,
      date,
    ).then((rows) => rows.map(toWorkoutSessionSummary));

    const existing = await this.todayRepository.findByUserAndDate(user.id, date);

    if (!existing) {
      const generatedItems = mergeWorkoutSessionsIntoItems([], sessions);
      const { items, adherence } = buildChecklistState(generatedItems);
      const checklist = await this.todayRepository.upsertChecklist(
        user.id,
        date,
        items,
        "generated",
        adherenceScoreValue(adherence),
      );

      return toTodayChecklistRecord(checklist);
    }

    const syncedItems = mergeWorkoutSessionsIntoItems(
      toTodayChecklistRecord(existing).items,
      sessions,
    );
    const { items, adherence } = buildChecklistState(syncedItems);
    const serializedExisting = JSON.stringify(toTodayChecklistRecord(existing).items);
    const serializedSynced = JSON.stringify(items);

    if (serializedExisting !== serializedSynced) {
      const updated = await this.todayRepository.updateChecklistState(
        user.id,
        existing.id,
        items,
        adherenceScoreValue(adherence),
      );

      if (!updated) {
        throw new NotFoundException("Daily checklist not found.");
      }

      return toTodayChecklistRecord(updated);
    }

    return toTodayChecklistRecord(existing);
  }

  async updateItemStatus(
    auth: ClerkAuthContext,
    dateInput: string,
    itemId: string,
    input: UpdateTodayItemStatusInput,
  ): Promise<TodayDayResponse> {
    const date = this.parseDate(dateInput);
    const user = await this.usersService.resolveFromAuth(auth);
    const day = await this.getOrGenerateDay(auth, date);
    const targetItem = day.items.find((item) => item.id === itemId);

    if (!targetItem) {
      throw new NotFoundException("Today checklist item not found.");
    }

    if (targetItem.status === input.status) {
      return day;
    }

    const updatedItems = applyItemStatusUpdate(day.items, itemId, input.status);
    const workoutSessionId = findWorkoutSessionIdForItem(updatedItems, itemId);

    if (workoutSessionId) {
      const session = await this.workoutsRepository.findSessionByUserId(
        user.id,
        workoutSessionId,
      );

      if (session?.status === "planned") {
        await this.workoutsRepository.completeSession(user.id, workoutSessionId, {
          status: input.status,
          feedback: readStoredWorkoutFeedback(session.feedback),
        });
      }
    }

    const { items, adherence } = buildChecklistState(updatedItems);
    const updated = await this.todayRepository.updateChecklistState(
      user.id,
      day.id,
      items,
      adherenceScoreValue(adherence),
    );

    if (!updated) {
      throw new NotFoundException("Daily checklist not found.");
    }

    return toTodayChecklistRecord(updated);
  }

  async updateFeedback(
    auth: ClerkAuthContext,
    dateInput: string,
    input: UpdateTodayFeedbackInput,
  ): Promise<TodayDayResponse> {
    const date = this.parseDate(dateInput);
    const user = await this.usersService.resolveFromAuth(auth);
    const day = await this.getOrGenerateDay(auth, date);
    const updated = await this.todayRepository.updateFeedback(user.id, day.id, input);

    if (!updated) {
      throw new NotFoundException("Daily checklist not found.");
    }

    return toTodayChecklistRecord(updated);
  }

  async getRecentHistory(
    auth: ClerkAuthContext,
    limit: number,
  ): Promise<TodayHistoryResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const rows = await this.todayRepository.listRecentByUserId(user.id, limit);

    return {
      entries: rows.map(toTodayHistoryEntry),
    };
  }

  async applyTodayChecklistProposal(
    userId: string,
    payload: TodayChecklistPayload,
  ): Promise<string> {
    const date = this.parseDate(payload.date);
    const existing = await this.todayRepository.findByUserAndDate(userId, date);
    const sessions = await this.workoutsRepository.listSessionsByUserAndPlannedDate(
      userId,
      date,
    ).then((rows) => rows.map(toWorkoutSessionSummary));
    const proposalItems = normalizeProposalItems(payload.items);
    const existingItems = existing ? toTodayChecklistRecord(existing).items : [];
    const mergedItems = mergeProposalItemsWithExisting(existingItems, proposalItems);
    const withWorkouts = mergeWorkoutSessionsIntoItems(mergedItems, sessions);
    const { items, adherence } = buildChecklistState(withWorkouts);

    const checklist = await this.todayRepository.createChecklistFromProposal(
      userId,
      { ...payload, date },
      items,
      "ai_proposal",
      adherenceScoreValue(adherence),
    );

    return `daily_checklist:${checklist.id}`;
  }

  private parseDate(value: string): string {
    const result = isoDateSchema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException(
        result.error.issues[0]?.message ?? "Expected date in YYYY-MM-DD format.",
      );
    }

    return result.data;
  }
}

type WorkoutSessionRow = {
  id: string;
  title: string;
  status: string;
};

function toWorkoutSessionSummary(session: WorkoutSessionRow): Pick<
  WorkoutSession,
  "id" | "title" | "status"
> {
  return {
    id: session.id,
    title: session.title,
    status: session.status as WorkoutSession["status"],
  };
}

function readStoredWorkoutFeedback(value: unknown) {
  const result = workoutCompletionFeedbackSchema.safeParse(value);

  return result.success ? result.data : {};
}
