import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { GoalsModule } from "../goals/goals.module.js";
import { NutritionModule } from "../nutrition/nutrition.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { TodayModule } from "../today/today.module.js";
import { UsersModule } from "../users/users.module.js";
import { WorkoutsModule } from "../workouts/workouts.module.js";
import { ProposalApplyService } from "./proposal-apply.service.js";
import { ProposalValidationService } from "./proposal-validation.service.js";
import { ProposalsController } from "./proposals.controller.js";
import { ProposalsRepository } from "./proposals.repository.js";
import { ProposalsService } from "./proposals.service.js";

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    ProfilesModule,
    GoalsModule,
    WorkoutsModule,
    NutritionModule,
    TodayModule,
  ],
  controllers: [ProposalsController],
  providers: [
    ProposalsRepository,
    ProposalsService,
    ProposalValidationService,
    ProposalApplyService,
  ],
  exports: [ProposalsService, ProposalValidationService],
})
export class ProposalsModule {}
