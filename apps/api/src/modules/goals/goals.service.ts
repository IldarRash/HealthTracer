import type { CreateGoalInput, Goal, GoalListQuery, UpdateGoalInput } from "@health/types";
import {
  getGoalHierarchyValidationErrors,
  mergeGoalHierarchyState,
} from "@health/types";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { UsersRepository } from "../users/users.repository.js";
import { toGoal } from "./goal.mapper.js";
import {
  GoalHierarchyLimitError,
  GoalsRepository,
} from "./goals.repository.js";

@Injectable()
export class GoalsService {
  constructor(
    private readonly goalsRepository: GoalsRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  private resolveParentGoal(existingGoals: Goal[], parentGoalId: string | null) {
    if (!parentGoalId) {
      return null;
    }

    return existingGoals.find((goal) => goal.id === parentGoalId) ?? null;
  }

  private validateGoalInput(
    input: CreateGoalInput | UpdateGoalInput,
    existingGoals: Goal[],
    existingGoal?: Goal,
  ) {
    const merged = mergeGoalHierarchyState(
      existingGoal
        ? {
            horizon: existingGoal.horizon,
            parentGoalId: existingGoal.parentGoalId,
            weekStart: existingGoal.weekStart,
            status: existingGoal.status,
          }
        : {
            horizon: null,
            parentGoalId: null,
            weekStart: null,
            status: "active",
          },
      {
        horizon: input.horizon,
        parentGoalId: input.parentGoalId,
        weekStart: input.weekStart,
        status: "status" in input ? input.status : undefined,
      },
    );

    const hierarchyErrors = getGoalHierarchyValidationErrors({
      merged,
      existingGoals,
      goalId: existingGoal?.id,
      parentGoal: this.resolveParentGoal(existingGoals, merged.parentGoalId),
    });

    if (hierarchyErrors.length > 0) {
      throw new BadRequestException(hierarchyErrors.join(" "));
    }
  }

  private handlePersistenceError(error: unknown): never {
    if (error instanceof GoalHierarchyLimitError) {
      throw new BadRequestException(error.message);
    }

    throw error;
  }

  async listCurrentGoals(auth: ClerkAuthContext, query?: GoalListQuery): Promise<Goal[]> {
    const user = await this.usersRepository.upsertFromAuth(auth);
    const goals = await this.goalsRepository.listByUserId(user.id, query);

    return goals.map(toGoal);
  }

  async createCurrentGoal(
    auth: ClerkAuthContext,
    input: CreateGoalInput,
  ): Promise<Goal> {
    const user = await this.usersRepository.upsertFromAuth(auth);
    const existingGoals = (await this.goalsRepository.listByUserId(user.id)).map(toGoal);
    this.validateGoalInput(input, existingGoals);

    try {
      const goal = await this.goalsRepository.create(user.id, input);
      return toGoal(goal);
    } catch (error) {
      this.handlePersistenceError(error);
    }
  }

  async updateCurrentGoal(
    auth: ClerkAuthContext,
    goalId: string,
    input: UpdateGoalInput,
  ): Promise<Goal> {
    const user = await this.usersRepository.upsertFromAuth(auth);
    const existingGoals = (await this.goalsRepository.listByUserId(user.id)).map(toGoal);
    const existingGoal = existingGoals.find((goal) => goal.id === goalId);

    if (!existingGoal) {
      throw new NotFoundException("Goal not found.");
    }

    this.validateGoalInput(input, existingGoals, existingGoal);

    try {
      const goal = await this.goalsRepository.update(user.id, goalId, input);

      if (!goal) {
        throw new NotFoundException("Goal not found.");
      }

      return toGoal(goal);
    } catch (error) {
      this.handlePersistenceError(error);
    }
  }
}
