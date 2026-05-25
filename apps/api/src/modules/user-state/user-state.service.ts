import type { CurrentUserState } from "@health/types";
import {
  buildCoachingHierarchySummary,
  getTodayIsoDateInTimezone,
  getWeekStartIsoDate,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { GoalsService } from "../goals/goals.service.js";
import { ProfilesService } from "../profiles/profiles.service.js";
import { UsersService } from "../users/users.service.js";

@Injectable()
export class UserStateService {
  constructor(
    private readonly usersService: UsersService,
    private readonly profilesService: ProfilesService,
    private readonly goalsService: GoalsService,
  ) {}

  async getCurrentUserState(auth: ClerkAuthContext): Promise<CurrentUserState> {
    const user = await this.usersService.resolveFromAuth(auth);
    const [profile, goals] = await Promise.all([
      this.profilesService.getCurrentProfile(auth),
      this.goalsService.listCurrentGoals(auth),
    ]);
    const weekStart = getWeekStartIsoDate(getTodayIsoDateInTimezone(user.timezone));

    return {
      user,
      profile,
      goals,
      onboardingCompleted: user.onboardingCompletedAt != null,
      hierarchy: buildCoachingHierarchySummary(profile, goals, weekStart),
    };
  }
}
