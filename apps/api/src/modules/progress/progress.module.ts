import { Module, forwardRef } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { RecoveryModule } from "../recovery/recovery.module.js";
import { WorkoutsModule } from "../workouts/workouts.module.js";
import { TodayModule } from "../today/today.module.js";
import { NutritionModule } from "../nutrition/nutrition.module.js";
import { HabitsModule } from "../habits/habits.module.js";
import { RecipesModule } from "../recipes/recipes.module.js";
import { ProposalsModule } from "../proposals/proposals.module.js";
import { WellbeingCheckInsModule } from "../wellbeing-check-ins/wellbeing-check-ins.module.js";
import { ProgressController } from "./progress.controller.js";
import { ProgressCrossDomainDataService } from "./progress-cross-domain-data.service.js";
import { ProgressHistoryAggregateService } from "./progress-history-aggregate.service.js";
import { ProgressRepository } from "./progress.repository.js";
import { ProgressService } from "./progress.service.js";
import { ProgressWeeklyReviewService } from "./progress-weekly-review.service.js";

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    WorkoutsModule,
    RecoveryModule,
    TodayModule,
    NutritionModule,
    HabitsModule,
    RecipesModule,
    WellbeingCheckInsModule,
    forwardRef(() => ProposalsModule),
  ],
  controllers: [ProgressController],
  providers: [
    ProgressRepository,
    ProgressCrossDomainDataService,
    ProgressHistoryAggregateService,
    ProgressService,
    ProgressWeeklyReviewService,
  ],
  exports: [
    ProgressService,
    ProgressRepository,
    ProgressWeeklyReviewService,
    ProgressHistoryAggregateService,
  ],
})
export class ProgressModule {}
