import type {
  ActiveHabitPlanResponse,
  HabitAdherenceCoachingSummary,
  HabitAdherenceResponse,
  HabitAdherenceWindow,
  HabitPlanPayload,
  HabitPlanRevisionsResponse,
  HabitTemplateListResponse,
} from "@health/types";
import {
  collectHabitTemplateReferences,
  computeHabitAdherenceSummary,
  createEmptyHabitAdherenceResponse,
  dedupeHabitCompletionRows,
  getHabitPlanAdaptationContinuityErrors,
  getHabitPlanDomainErrors,
  getHabitPlanIntentStateErrors,
  getHabitTemplateUsageErrors,
  getTodayIsoDateInTimezone,
  habitPlanPayloadSchema,
  shiftIsoDate,
  summarizeHabitAdherenceForCoaching,
} from "@health/types";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { UsersService } from "../users/users.service.js";
import { toHabitPlan, toHabitPlanRevision, toHabitTemplate } from "./habits.mapper.js";
import { HabitsRepository } from "./habits.repository.js";

@Injectable()
export class HabitsService {
  constructor(
    private readonly habitsRepository: HabitsRepository,
    private readonly usersService: UsersService,
  ) {}

  async getCurrentActivePlan(auth: ClerkAuthContext): Promise<ActiveHabitPlanResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const plan = await this.habitsRepository.findActivePlanByUserId(user.id);

    if (!plan) {
      return { plan: null, activeRevision: null };
    }

    const activeRevision = plan.activeRevisionId
      ? await this.habitsRepository.findActiveRevisionByPlanId(
          plan.id,
          plan.activeRevisionId,
        )
      : null;

    return {
      plan: toHabitPlan(plan),
      activeRevision: activeRevision ? toHabitPlanRevision(activeRevision) : null,
    };
  }

  async listCurrentRevisions(auth: ClerkAuthContext): Promise<HabitPlanRevisionsResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const revisions = await this.habitsRepository.listRevisionsByUserId(user.id);

    return {
      revisions: revisions.map(toHabitPlanRevision),
    };
  }

  async getAdherence(
    auth: ClerkAuthContext,
    window: HabitAdherenceWindow,
  ): Promise<HabitAdherenceResponse> {
    const user = await this.usersService.resolveFromAuth(auth);

    return this.getAdherenceForUser(user.id, user.timezone, window);
  }

  async listTemplates(): Promise<HabitTemplateListResponse> {
    const rows = await this.habitsRepository.listActiveTemplates();

    return {
      templates: rows.map(toHabitTemplate),
    };
  }

  async getHabitTemplateReferenceErrors(payload: HabitPlanPayload): Promise<string[]> {
    const parsedPayload = habitPlanPayloadSchema.safeParse(payload);

    if (!parsedPayload.success) {
      return [];
    }

    const { templateIds, templateSlugs } = collectHabitTemplateReferences(parsedPayload.data);

    if (templateIds.length === 0 && templateSlugs.length === 0) {
      return [];
    }

    const [templatesByIdRows, templatesBySlugRows] = await Promise.all([
      this.habitsRepository.findActiveTemplatesByIds(templateIds),
      this.habitsRepository.findActiveTemplatesBySlugs(templateSlugs),
    ]);

    const templatesById = new Map(
      templatesByIdRows.map((row) => [row.id, toHabitTemplate(row)]),
    );
    const templatesBySlug = new Map(
      templatesBySlugRows.map((row) => [row.slug, toHabitTemplate(row)]),
    );

    return getHabitTemplateUsageErrors(
      parsedPayload.data.habits,
      templatesById,
      templatesBySlug,
    );
  }

  async getRecentAdherenceForCoaching(
    userId: string,
    timezone: string,
  ): Promise<HabitAdherenceCoachingSummary | null> {
    const adherence = await this.getAdherenceForUser(userId, timezone, 7);

    if (adherence.habits.length === 0) {
      return null;
    }

    return summarizeHabitAdherenceForCoaching(adherence);
  }

  async getAdherenceForUser(
    userId: string,
    timezone: string,
    window: HabitAdherenceWindow,
  ): Promise<HabitAdherenceResponse> {
    const windowEnd = getTodayIsoDateInTimezone(timezone);
    const plan = await this.habitsRepository.findActivePlanByUserId(userId);

    if (!plan?.activeRevisionId) {
      return createEmptyHabitAdherenceResponse(window, windowEnd);
    }

    const activeRevision = await this.habitsRepository.findActiveRevisionByPlanId(
      plan.id,
      plan.activeRevisionId,
    );

    if (!activeRevision) {
      return createEmptyHabitAdherenceResponse(window, windowEnd);
    }

    const parsedPayload = habitPlanPayloadSchema.safeParse(activeRevision.payload);

    if (!parsedPayload.success) {
      return createEmptyHabitAdherenceResponse(window, windowEnd);
    }

    const windowStart = shiftIsoDate(windowEnd, -(window - 1));
    const completionRows = await this.habitsRepository.listCompletionsInDateRange(
      userId,
      windowStart,
      windowEnd,
    );

    return computeHabitAdherenceSummary({
      habits: parsedPayload.data.habits,
      window,
      windowEnd,
      completionRows: dedupeHabitCompletionRows(
        completionRows.map((row) => ({
          habitDefinitionId: row.habitDefinitionId,
          date: row.date,
          status: row.status as "completed" | "skipped" | "pending",
        })),
      ),
    });
  }

  async applyHabitPlanProposal(
    userId: string,
    payload: HabitPlanPayload,
    reason: string,
    intent: "create_habit_plan" | "adapt_habit_plan",
  ): Promise<string> {
    const parsedPayload = habitPlanPayloadSchema.parse(payload);
    const domainErrors = getHabitPlanDomainErrors(parsedPayload);

    if (domainErrors.length > 0) {
      throw new BadRequestException({
        message: "Habit plan payload failed domain validation.",
        validationErrors: domainErrors,
      });
    }

    const existingPlan = await this.habitsRepository.findActivePlanByUserId(userId);
    const intentErrors = getHabitPlanIntentStateErrors(intent, Boolean(existingPlan));

    if (intentErrors.length > 0) {
      throw new BadRequestException({
        message: "Habit plan proposal intent does not match current plan state.",
        validationErrors: intentErrors,
      });
    }

    if (intent === "create_habit_plan") {
      const { revision } = await this.habitsRepository.createPlanWithRevision(
        userId,
        parsedPayload,
        reason,
        "ai_proposal",
      );

      return `habit_revision:${revision.id}`;
    }

    if (!existingPlan?.activeRevisionId) {
      throw new BadRequestException({
        message: "Active habit plan revision is missing.",
        validationErrors: [
          "proposedChanges: adapt_habit_plan requires an active habit plan revision.",
        ],
      });
    }

    const activeRevision = await this.habitsRepository.findActiveRevisionByPlanId(
      existingPlan.id,
      existingPlan.activeRevisionId,
    );

    if (!activeRevision) {
      throw new BadRequestException({
        message: "Active habit plan revision is missing.",
        validationErrors: [
          "proposedChanges: adapt_habit_plan requires an active habit plan revision.",
        ],
      });
    }

    const currentPayload = habitPlanPayloadSchema.parse(activeRevision.payload);
    const continuityErrors = getHabitPlanAdaptationContinuityErrors(
      currentPayload,
      parsedPayload,
    );

    if (continuityErrors.length > 0) {
      throw new BadRequestException({
        message: "Habit plan adaptation failed continuity validation.",
        validationErrors: continuityErrors,
      });
    }

    const revision = await this.habitsRepository.appendRevision(
      existingPlan.id,
      parsedPayload,
      reason,
      "ai_proposal",
    );

    return `habit_revision:${revision.id}`;
  }
}
