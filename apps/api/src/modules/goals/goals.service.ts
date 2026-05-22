import type { CreateGoalInput, Goal, UpdateGoalInput } from "@health/types";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { UsersService } from "../users/users.service.js";
import { toGoal } from "./goal.mapper.js";
import { GoalsRepository } from "./goals.repository.js";

@Injectable()
export class GoalsService {
  constructor(
    private readonly goalsRepository: GoalsRepository,
    private readonly usersService: UsersService,
  ) {}

  async listCurrentGoals(auth: ClerkAuthContext): Promise<Goal[]> {
    const user = await this.usersService.resolveFromAuth(auth);
    const goals = await this.goalsRepository.listByUserId(user.id);

    return goals.map(toGoal);
  }

  async createCurrentGoal(
    auth: ClerkAuthContext,
    input: CreateGoalInput,
  ): Promise<Goal> {
    const user = await this.usersService.resolveFromAuth(auth);
    const goal = await this.goalsRepository.create(user.id, input);

    return toGoal(goal);
  }

  async updateCurrentGoal(
    auth: ClerkAuthContext,
    goalId: string,
    input: UpdateGoalInput,
  ): Promise<Goal> {
    const user = await this.usersService.resolveFromAuth(auth);
    const goal = await this.goalsRepository.update(user.id, goalId, input);

    if (!goal) {
      throw new NotFoundException("Goal not found.");
    }

    return toGoal(goal);
  }
}
