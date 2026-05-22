import type { Goal, User, UserProfile } from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { GoalsService } from "../goals/goals.service.js";
import { NutritionRepository } from "../nutrition/nutrition.repository.js";
import { ProfilesService } from "../profiles/profiles.service.js";
import { UsersService } from "../users/users.service.js";
import { WorkoutsRepository } from "../workouts/workouts.repository.js";

export interface CoachingContextSnapshot {
  user: User;
  profile: UserProfile | null;
  goals: Goal[];
  activeWorkoutRevisionId: string | null;
  activeNutritionRevisionId: string | null;
}

@Injectable()
export class CoachingContextService {
  constructor(
    private readonly usersService: UsersService,
    private readonly profilesService: ProfilesService,
    private readonly goalsService: GoalsService,
    private readonly workoutsRepository: WorkoutsRepository,
    private readonly nutritionRepository: NutritionRepository,
  ) {}

  async buildSnapshot(auth: ClerkAuthContext): Promise<CoachingContextSnapshot> {
    const user = await this.usersService.resolveFromAuth(auth);
    const [profile, goals, workoutPlan, nutritionPlan] = await Promise.all([
      this.profilesService.getCurrentProfile(auth),
      this.goalsService.listCurrentGoals(auth),
      this.workoutsRepository.findActivePlanByUserId(user.id),
      this.nutritionRepository.findActivePlanByUserId(user.id),
    ]);

    return {
      user,
      profile,
      goals,
      activeWorkoutRevisionId: workoutPlan?.activeRevisionId ?? null,
      activeNutritionRevisionId: nutritionPlan?.activeRevisionId ?? null,
    };
  }

  toPromptContext(snapshot: CoachingContextSnapshot): Record<string, unknown> {
    return {
      user: {
        id: snapshot.user.id,
        timezone: snapshot.user.timezone,
        displayName: snapshot.user.displayName,
      },
      profile: snapshot.profile
        ? {
            activityLevel: snapshot.profile.activityLevel,
            trainingExperience: snapshot.profile.trainingExperience,
            preferences: snapshot.profile.preferences,
            constraints: snapshot.profile.constraints,
          }
        : null,
      goals: snapshot.goals.map((goal) => ({
        id: goal.id,
        type: goal.type,
        status: goal.status,
        priority: goal.priority,
        title: goal.title,
      })),
      activeWorkoutRevisionId: snapshot.activeWorkoutRevisionId,
      activeNutritionRevisionId: snapshot.activeNutritionRevisionId,
    };
  }
}
