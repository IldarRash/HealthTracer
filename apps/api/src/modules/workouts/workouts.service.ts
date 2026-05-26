import {
  collectWorkoutPlanExerciseIds,
  deriveWorkoutSessionStatusFromExercises,
  getResolvedWorkoutPlanCatalogErrors,
  getWorkoutPlanDomainErrors,
  normalizeWorkoutSessionExercises,
  workoutPlanPayloadSchema,
  type ActiveWorkoutPlanResponse,
  type CompleteWorkoutSessionInput,
  type ScheduleWorkoutSessionInput,
  type TodayWorkoutDetail,
  type UpdateWorkoutSessionExerciseInput,
  type WorkoutPlanProposalChanges,
  type WorkoutPlanRevision,
  type WorkoutSession,
} from "@health/types";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ExercisesService } from "../exercises/exercises.service.js";
import { UsersService } from "../users/users.service.js";
import { resolveWorkoutPlanProposalForApply } from "./workout-plan-resolver.js";
import {
  collectExerciseIdsFromSessionExercises,
  enrichWorkoutPlanPayload,
  enrichWorkoutSessionExercises,
  indexExercisesById,
} from "./workout-catalog-enrichment.js";
import {
  resolveTodayWorkoutFromPlan,
  toTodayWorkoutDetail,
  updateStructuredSessionExercise,
} from "./workout-session-materializer.js";
import {
  toWorkoutPlan,
  toWorkoutPlanRevision,
  toWorkoutSession,
} from "./workout.mapper.js";
import { WorkoutsRepository, isPostgresUniqueViolation } from "./workouts.repository.js";

@Injectable()
export class WorkoutsService {
  constructor(
    private readonly workoutsRepository: WorkoutsRepository,
    private readonly usersService: UsersService,
    private readonly exercisesService: ExercisesService,
  ) {}

  async getCurrentActivePlan(
    auth: ClerkAuthContext,
  ): Promise<ActiveWorkoutPlanResponse> {
    const user = await this.usersService.resolveFromAuth(auth);
    const plan = await this.workoutsRepository.findActivePlanByUserId(user.id);

    if (!plan) {
      return { plan: null, activeRevision: null, sessions: [] };
    }

    const [activeRevision, sessions] = await Promise.all([
      plan.activeRevisionId
        ? this.workoutsRepository.findActiveRevisionByPlanId(
            plan.id,
            plan.activeRevisionId,
          )
        : Promise.resolve(null),
      this.workoutsRepository.listSessionsByPlanId(user.id, plan.id),
    ]);

    const mappedRevision = activeRevision ? toWorkoutPlanRevision(activeRevision) : null;
    const enrichedRevision = mappedRevision
      ? await this.enrichRevisionPayload(user.id, mappedRevision)
      : null;

    return {
      plan: toWorkoutPlan(plan),
      activeRevision: enrichedRevision,
      sessions: sessions.map(toWorkoutSession),
    };
  }

  async listCurrentRevisions(
    auth: ClerkAuthContext,
  ): Promise<WorkoutPlanRevision[]> {
    const user = await this.usersService.resolveFromAuth(auth);
    const revisions = await this.workoutsRepository.listRevisionsByUserId(user.id);

    return revisions.map(toWorkoutPlanRevision);
  }

  async scheduleCurrentSession(
    auth: ClerkAuthContext,
    input: ScheduleWorkoutSessionInput,
  ): Promise<WorkoutSession> {
    const user = await this.usersService.resolveFromAuth(auth);
    const revisionWithPlan = await this.workoutsRepository.findActiveRevisionForUser(
      user.id,
      input.workoutPlanRevisionId,
    );

    if (!revisionWithPlan) {
      throw new NotFoundException("Active workout plan revision not found.");
    }

    const session = await this.workoutsRepository.scheduleSession(
      user.id,
      revisionWithPlan.plan.id,
      input,
    );

    return toWorkoutSession(session);
  }

  async completeCurrentSession(
    auth: ClerkAuthContext,
    sessionId: string,
    input: CompleteWorkoutSessionInput,
  ): Promise<WorkoutSession> {
    const user = await this.usersService.resolveFromAuth(auth);
    const session = await this.workoutsRepository.completeSession(
      user.id,
      sessionId,
      input,
    );

    if (!session) {
      throw new NotFoundException("Workout session not found.");
    }

    return toWorkoutSession(session);
  }

  async ensureTodayWorkoutSession(
    auth: ClerkAuthContext,
    plannedDate: string,
  ): Promise<TodayWorkoutDetail | null> {
    const user = await this.usersService.resolveFromAuth(auth);
    const context = await this.resolveTodayWorkoutContext(user.id, plannedDate);

    if (!context || !context.planDay || context.planDay.exercises.length === 0) {
      return null;
    }

    if (context.reusableSession) {
      return this.buildTodayWorkoutDetail(
        user.id,
        context.reusableSession,
        context.weekday,
        context.planDay.focus,
      );
    }

    if (!context.shouldMaterialize || !context.sessionTitle) {
      return null;
    }

    const sessionRow = await this.workoutsRepository.materializeSession(
      user.id,
      context.plan.id,
      context.activeRevision.id,
      plannedDate,
      context.sessionTitle,
      context.sessionExercises,
    );

    return this.buildTodayWorkoutDetail(
      user.id,
      toWorkoutSession(sessionRow),
      context.weekday,
      context.planDay.focus,
    );
  }

  async startTodayWorkoutSession(
    auth: ClerkAuthContext,
    plannedDate: string,
  ): Promise<TodayWorkoutDetail> {
    const workout = await this.ensureTodayWorkoutSession(auth, plannedDate);

    if (!workout) {
      throw new NotFoundException("No workout is scheduled for this date.");
    }

    return workout;
  }

  async updateSessionExercise(
    auth: ClerkAuthContext,
    sessionId: string,
    exerciseId: string,
    input: UpdateWorkoutSessionExerciseInput,
  ): Promise<WorkoutSession> {
    const user = await this.usersService.resolveFromAuth(auth);
    const existingSession = await this.workoutsRepository.findSessionByUserId(user.id, sessionId);

    if (!existingSession) {
      throw new NotFoundException("Workout session not found.");
    }

    const currentSession = toWorkoutSession(existingSession);
    const structuredExercises = normalizeWorkoutSessionExercises(
      currentSession.id,
      currentSession.exercises,
    );
    const updatedExercises = updateStructuredSessionExercise(
      structuredExercises,
      exerciseId,
      input,
    );

    if (updatedExercises === structuredExercises) {
      throw new NotFoundException("Workout session exercise not found.");
    }

    const nextStatus = deriveWorkoutSessionStatusFromExercises(
      updatedExercises,
      currentSession.status,
    );
    const shouldSetCompletedAt =
      nextStatus !== currentSession.status &&
      (nextStatus === "completed" || nextStatus === "skipped");

    const sessionRow = await this.workoutsRepository.updateSessionState(user.id, sessionId, {
      exercises: updatedExercises,
      status: nextStatus,
      completedAt: shouldSetCompletedAt
        ? new Date()
        : nextStatus === "planned"
          ? null
          : existingSession.completedAt,
    });

    if (!sessionRow) {
      throw new NotFoundException("Workout session not found.");
    }

    return toWorkoutSession(sessionRow);
  }

  async applyWorkoutPlanProposal(
    userId: string,
    changes: WorkoutPlanProposalChanges,
    reason: string,
    _intent: "create_workout_plan" | "adapt_workout_plan",
  ): Promise<string> {
    const resolvedPayload = await resolveWorkoutPlanProposalForApply(
      this.exercisesService,
      userId,
      changes,
    );
    const exerciseIds = collectWorkoutPlanExerciseIds(resolvedPayload);
    const inaccessibleExerciseIds = await this.exercisesService.findInaccessibleExerciseIds(
      exerciseIds,
      userId,
    );

    if (inaccessibleExerciseIds.length > 0) {
      throw new BadRequestException({
        message: "Workout plan references exercises that are not available in the catalog.",
        validationErrors: inaccessibleExerciseIds.map(
          (exerciseId) =>
            `proposedChanges: exerciseId "${exerciseId}" was not found in the visible exercise catalog.`,
        ),
      });
    }

    const parsedPayload = workoutPlanPayloadSchema.parse(resolvedPayload);
    const domainErrors = [
      ...getWorkoutPlanDomainErrors(parsedPayload, { requireStructuredPlan: true }),
      ...getResolvedWorkoutPlanCatalogErrors(parsedPayload),
    ];

    if (domainErrors.length > 0) {
      throw new BadRequestException({
        message: "Workout plan payload failed domain validation.",
        validationErrors: domainErrors,
      });
    }

    let existingPlan = await this.workoutsRepository.findActivePlanByUserId(userId);

    if (!existingPlan) {
      try {
        const { revision } = await this.workoutsRepository.createPlanWithRevision(
          userId,
          parsedPayload,
          reason,
          "ai_proposal",
        );

        return `workout_revision:${revision.id}`;
      } catch (error) {
        if (!isPostgresUniqueViolation(error)) {
          throw error;
        }

        existingPlan = await this.workoutsRepository.findActivePlanByUserId(userId);

        if (!existingPlan) {
          throw error;
        }
      }
    }

    const revision = await this.workoutsRepository.appendRevision(
      existingPlan.id,
      parsedPayload,
      reason,
      "ai_proposal",
    );

    return `workout_revision:${revision.id}`;
  }

  private async resolveTodayWorkoutContext(userId: string, plannedDate: string) {
    const plan = await this.workoutsRepository.findActivePlanByUserId(userId);

    if (!plan?.activeRevisionId) {
      return null;
    }

    const [activeRevisionRow, existingSessionRows] = await Promise.all([
      this.workoutsRepository.findActiveRevisionByPlanId(plan.id, plan.activeRevisionId),
      this.workoutsRepository.listSessionsByUserAndPlannedDate(userId, plannedDate),
    ]);

    if (!activeRevisionRow) {
      return null;
    }

    const activeRevision = toWorkoutPlanRevision(activeRevisionRow);
    const existingSessions = existingSessionRows.map(toWorkoutSession);
    const resolved = resolveTodayWorkoutFromPlan({
      plannedDate,
      plan,
      activeRevision,
      existingSessions,
    });

    if (!resolved) {
      return null;
    }

    return {
      plan,
      activeRevision,
      existingSessions,
      ...resolved,
    };
  }

  private async enrichRevisionPayload(
    userId: string,
    revision: WorkoutPlanRevision,
  ): Promise<WorkoutPlanRevision> {
    const exerciseIds = collectWorkoutPlanExerciseIds(revision.payload);
    const catalogExercises = await this.exercisesService.findExercisesByIds(exerciseIds, userId);

    return {
      ...revision,
      payload: enrichWorkoutPlanPayload(
        revision.payload,
        indexExercisesById(catalogExercises),
      ),
    };
  }

  private async buildTodayWorkoutDetail(
    userId: string,
    session: WorkoutSession,
    weekday: TodayWorkoutDetail["weekday"],
    focus: string,
  ): Promise<TodayWorkoutDetail> {
    const normalizedExercises = normalizeWorkoutSessionExercises(session.id, session.exercises);
    const exerciseIds = collectExerciseIdsFromSessionExercises(normalizedExercises);
    const catalogExercises = await this.exercisesService.findExercisesByIds(exerciseIds, userId);
    const enrichedExercises = enrichWorkoutSessionExercises(
      session.id,
      session.exercises,
      indexExercisesById(catalogExercises),
    );

    return {
      ...toTodayWorkoutDetail(session, weekday, focus),
      exercises: enrichedExercises,
    };
  }
}
