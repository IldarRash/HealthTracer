import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { DatabaseModule } from "./database/database.module.js";
import { ObservabilityModule } from "./observability/observability.module.js";
import { RequestIdMiddleware } from "./observability/request-id.middleware.js";
import { AiModule } from "./modules/ai/ai.module.js";
import { BillingModule } from "./modules/billing/billing.module.js";
import { BiomarkersModule } from "./modules/biomarkers/biomarkers.module.js";
import { BodyModule } from "./modules/body/body.module.js";
import { ChatModule } from "./modules/chat/chat.module.js";
import { ChatAttachmentsModule } from "./modules/chat-attachments/chat-attachments.module.js";
import { CoachingContextModule } from "./modules/coaching-context/coaching-context.module.js";
import { DeviceConnectionsModule } from "./modules/device-connections/device-connections.module.js";
import { ExercisesModule } from "./modules/exercises/exercises.module.js";
import { GoalsModule } from "./modules/goals/goals.module.js";
import { HabitsModule } from "./modules/habits/habits.module.js";
import { HealthMetricsModule } from "./modules/health-metrics/health-metrics.module.js";
import { NutritionModule } from "./modules/nutrition/nutrition.module.js";
import { OnboardingModule } from "./modules/onboarding/onboarding.module.js";
import { ProfilesModule } from "./modules/profiles/profiles.module.js";
import { ProgressModule } from "./modules/progress/progress.module.js";
import { ProposalsModule } from "./modules/proposals/proposals.module.js";
import { RecipesModule } from "./modules/recipes/recipes.module.js";
import { RecoveryModule } from "./modules/recovery/recovery.module.js";
import { TodayModule } from "./modules/today/today.module.js";
import { UserStateModule } from "./modules/user-state/user-state.module.js";
import { WellbeingCheckInsModule } from "./modules/wellbeing-check-ins/wellbeing-check-ins.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { WorkoutsModule } from "./modules/workouts/workouts.module.js";

@Module({
  imports: [
    DatabaseModule,
    ObservabilityModule,
    UsersModule,
    UserStateModule,
    OnboardingModule,
    ProfilesModule,
    GoalsModule,
    HabitsModule,
    WorkoutsModule,
    ExercisesModule,
    NutritionModule,
    RecipesModule,
    TodayModule,
    WellbeingCheckInsModule,
    RecoveryModule,
    ProgressModule,
    BiomarkersModule,
    CoachingContextModule,
    AiModule,
    ChatModule,
    ChatAttachmentsModule,
    ProposalsModule,
    DeviceConnectionsModule,
    HealthMetricsModule,
    BillingModule,
    BodyModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
