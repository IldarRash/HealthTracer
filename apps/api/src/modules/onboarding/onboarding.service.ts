import type { CurrentUserState, OnboardingInput } from "@health/types";
import { getActiveHierarchyLimitErrors } from "@health/types";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { GoalsRepository } from "../goals/goals.repository.js";
import { toGoal } from "../goals/goal.mapper.js";
import { UserStateService } from "../user-state/user-state.service.js";
import { UsersService } from "../users/users.service.js";
import {
  DuplicateActiveQuarterlyGoalError,
  OnboardingRepository,
} from "./onboarding.repository.js";

@Injectable()
export class OnboardingService {
  constructor(
    private readonly onboardingRepository: OnboardingRepository,
    private readonly usersService: UsersService,
    private readonly goalsRepository: GoalsRepository,
    private readonly userStateService: UserStateService,
  ) {}

  async completeOnboarding(
    auth: ClerkAuthContext,
    input: OnboardingInput,
  ): Promise<CurrentUserState> {
    const user = await this.usersService.resolveFromAuth(auth);
    const existingGoals = (await this.goalsRepository.listByUserId(user.id)).map(toGoal);
    const limitErrors = getActiveHierarchyLimitErrors(existingGoals, {
      id: "onboarding-quarterly",
      status: "active",
      horizon: "quarterly",
    });

    if (limitErrors.length > 0) {
      throw new BadRequestException(limitErrors.join(" "));
    }

    try {
      await this.onboardingRepository.completeOnboarding(user.id, input);
    } catch (error) {
      if (error instanceof DuplicateActiveQuarterlyGoalError) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }

    return this.userStateService.getCurrentUserState(auth);
  }
}
