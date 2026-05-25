import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { GoalsModule } from "../goals/goals.module.js";
import { UserStateModule } from "../user-state/user-state.module.js";
import { UsersModule } from "../users/users.module.js";
import { OnboardingController } from "./onboarding.controller.js";
import { OnboardingRepository } from "./onboarding.repository.js";
import { OnboardingService } from "./onboarding.service.js";

@Module({
  imports: [DatabaseModule, UsersModule, GoalsModule, UserStateModule],
  controllers: [OnboardingController],
  providers: [OnboardingRepository, OnboardingService],
})
export class OnboardingModule {}
