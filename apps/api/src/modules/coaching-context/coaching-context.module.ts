import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents/documents.module.js";
import { GoalsModule } from "../goals/goals.module.js";
import { HealthMetricsModule } from "../health-metrics/health-metrics.module.js";
import { NutritionModule } from "../nutrition/nutrition.module.js";
import { ProgressModule } from "../progress/progress.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { UsersModule } from "../users/users.module.js";
import { WorkoutsModule } from "../workouts/workouts.module.js";
import { CoachingContextService } from "./coaching-context.service.js";

@Module({
  imports: [
    UsersModule,
    ProfilesModule,
    GoalsModule,
    WorkoutsModule,
    NutritionModule,
    ProgressModule,
    DocumentsModule,
    HealthMetricsModule,
  ],
  providers: [CoachingContextService],
  exports: [CoachingContextService],
})
export class CoachingContextModule {}
