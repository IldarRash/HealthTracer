import {
  workoutPlanPayloadSchema,
  type ActiveWorkoutPlanResponse,
  type CompleteWorkoutSessionInput,
  type ScheduleWorkoutSessionInput,
  type WorkoutPlanPayload,
  type WorkoutPlanRevision,
  type WorkoutSession,
} from "@health/types";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { UsersService } from "../users/users.service.js";
import {
  toWorkoutPlan,
  toWorkoutPlanRevision,
  toWorkoutSession,
} from "./workout.mapper.js";
import { WorkoutsRepository } from "./workouts.repository.js";

@Injectable()
export class WorkoutsService {
  constructor(
    private readonly workoutsRepository: WorkoutsRepository,
    private readonly usersService: UsersService,
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

    return {
      plan: toWorkoutPlan(plan),
      activeRevision: activeRevision ? toWorkoutPlanRevision(activeRevision) : null,
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

  async applyWorkoutPlanProposal(
    userId: string,
    payload: WorkoutPlanPayload,
    reason: string,
    _intent: "create_workout_plan" | "adapt_workout_plan",
  ): Promise<string> {
    const parsedPayload = workoutPlanPayloadSchema.parse(payload);
    const existingPlan = await this.workoutsRepository.findActivePlanByUserId(userId);

    if (!existingPlan) {
      const { revision } = await this.workoutsRepository.createPlanWithRevision(
        userId,
        parsedPayload,
        reason,
        "ai_proposal",
      );

      return `workout_revision:${revision.id}`;
    }

    const revision = await this.workoutsRepository.appendRevision(
      existingPlan.id,
      parsedPayload,
      reason,
      "ai_proposal",
    );

    return `workout_revision:${revision.id}`;
  }
}
