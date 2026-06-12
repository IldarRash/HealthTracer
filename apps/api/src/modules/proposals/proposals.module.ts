import { Module, forwardRef } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { BiomarkersModule } from "../biomarkers/biomarkers.module.js";
import { BodyModule } from "../body/body.module.js";
import { ExercisesModule } from "../exercises/exercises.module.js";
import { GoalsModule } from "../goals/goals.module.js";
import { HabitsModule } from "../habits/habits.module.js";
import { HealthMetricsModule } from "../health-metrics/health-metrics.module.js";
import { NutritionModule } from "../nutrition/nutrition.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { ProgressModule } from "../progress/progress.module.js";
import { RecoveryModule } from "../recovery/recovery.module.js";
import { RecipesModule } from "../recipes/recipes.module.js";
import { TodayModule } from "../today/today.module.js";
import { UsersModule } from "../users/users.module.js";
import { WellbeingCheckInsModule } from "../wellbeing-check-ins/wellbeing-check-ins.module.js";
import { WorkoutsModule } from "../workouts/workouts.module.js";
import { ChatAttachmentsModule } from "../chat-attachments/chat-attachments.module.js";
import { ProposalApplyService } from "./proposal-apply.service.js";
import { ProposalNormalizationService } from "./proposal-normalization.service.js";
import { ProposalValidationService } from "./proposal-validation.service.js";
import { ProposalsController } from "./proposals.controller.js";
import { ProposalsRepository } from "./proposals.repository.js";
import { ProposalsService } from "./proposals.service.js";

@Module({
  imports: [
    DatabaseModule,
    BiomarkersModule,
    BodyModule,
    HealthMetricsModule,
    UsersModule,
    ExercisesModule,
    ProfilesModule,
    forwardRef(() => ProgressModule),
    RecoveryModule,
    GoalsModule,
    WorkoutsModule,
    NutritionModule,
    HabitsModule,
    forwardRef(() => RecipesModule),
    TodayModule,
    WellbeingCheckInsModule,
    ChatAttachmentsModule,
  ],
  controllers: [ProposalsController],
  providers: [
    ProposalsRepository,
    ProposalsService,
    ProposalNormalizationService,
    ProposalValidationService,
    ProposalApplyService,
  ],
  exports: [
    ProposalsService,
    ProposalNormalizationService,
    ProposalValidationService,
    ProposalsRepository,
  ],
})
export class ProposalsModule {}
