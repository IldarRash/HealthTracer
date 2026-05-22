import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { DatabaseModule } from "./database/database.module.js";
import { AiModule } from "./modules/ai/ai.module.js";
import { ChatModule } from "./modules/chat/chat.module.js";
import { CoachingContextModule } from "./modules/coaching-context/coaching-context.module.js";
import { GoalsModule } from "./modules/goals/goals.module.js";
import { NutritionModule } from "./modules/nutrition/nutrition.module.js";
import { ProfilesModule } from "./modules/profiles/profiles.module.js";
import { ProposalsModule } from "./modules/proposals/proposals.module.js";
import { TodayModule } from "./modules/today/today.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { WorkoutsModule } from "./modules/workouts/workouts.module.js";

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    ProfilesModule,
    GoalsModule,
    WorkoutsModule,
    NutritionModule,
    TodayModule,
    CoachingContextModule,
    AiModule,
    ChatModule,
    ProposalsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
