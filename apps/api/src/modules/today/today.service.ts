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
import { WorkoutsService } from "../workouts/workouts.service.js";
import { WorkoutsRepository } from "../workouts/workouts.repository.js";
import {
  applyItemStatusUpdate,
  buildChecklistState,
  filterWorkoutSessionsForChecklist,
  findWorkoutSessionIdForItem,
  mergeProposalItemsWithExisting,
  normalizeProposalItems,
  syncTodayChecklistWorkoutItems,
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
    private readonly workoutsService: WorkoutsService,
    private readonly usersService: UsersService,
  ) {}

  async getOrGenerateDay(auth: ClerkAuthContext, dateInput: string): Promise<TodayDayResponse> {
    const date = this.parseDate(dateInput);
    const user = await this.usersService.resolveFromAuth(auth);
    const workout = await this.workoutsService.ensureTodayWorkoutSession(auth, date);
    const sessions = await this.listChecklistWorkoutSessions(user.id, date);

    const existing = await this.todayRepository.findByUserAndDate(user.id, date);

    if (!existing) {
      const generatedItems = syncTodayChecklistWorkoutItems([], sessions);
      const { items, adherence } = buildChecklistState(generatedItems);
      const checklist = await this.todayRepository.upsertChecklist(
        user.id,
        date,
        items,
        "generated",
        adherenceScoreValue(adherence),
      );

      return this.buildDayResponse(checklist, workout);
    }

    const syncedItems = syncTodayChecklistWorkoutItems(
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

      return this.buildDayResponse(updated, workout);
    }

    return this.buildDayResponse(existing, workout);
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

    const workout = await this.workoutsService.ensureTodayWorkoutSession(auth, date);

    return this.buildDayResponse(updated, workout);
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

    return this.buildDayResponse(updated, day.workout ?? null);
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
    const sessions = await this.listChecklistWorkoutSessions(userId, date);
    const proposalItems = normalizeProposalItems(payload.items);
    const existingItems = existing ? toTodayChecklistRecord(existing).items : [];
    const mergedItems = mergeProposalItemsWithExisting(existingItems, proposalItems);
    const withWorkouts = syncTodayChecklistWorkoutItems(mergedItems, sessions);
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

  private async listChecklistWorkoutSessions(userId: string, date: string) {
    const [activePlan, sessionRows] = await Promise.all([
      this.workoutsRepository.findActivePlanByUserId(userId),
      this.workoutsRepository.listSessionsByUserAndPlannedDate(userId, date),
    ]);

    const activePlanContext =
      activePlan?.activeRevisionId != null
        ? { planId: activePlan.id, activeRevisionId: activePlan.activeRevisionId }
        : null;

    return filterWorkoutSessionsForChecklist(
      sessionRows.map(toWorkoutSessionChecklistSummary),
      activePlanContext,
    );
  }

  private buildDayResponse(
    row: Parameters<typeof toTodayChecklistRecord>[0],
    workout: TodayDayResponse["workout"],
  ): TodayDayResponse {
    return {
      ...toTodayChecklistRecord(row),
      workout,
    };
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
  workoutPlanId: string;
  workoutPlanRevisionId: string;
};

function toWorkoutSessionChecklistSummary(session: WorkoutSessionRow): Pick<
  WorkoutSession,
  "id" | "title" | "status" | "workoutPlanId" | "workoutPlanRevisionId"
> {
  return {
    id: session.id,
    title: session.title,
    status: session.status as WorkoutSession["status"],
    workoutPlanId: session.workoutPlanId,
    workoutPlanRevisionId: session.workoutPlanRevisionId,
  };
}

function readStoredWorkoutFeedback(value: unknown) {
  const result = workoutCompletionFeedbackSchema.safeParse(value);

  return result.success ? result.data : {};
}
