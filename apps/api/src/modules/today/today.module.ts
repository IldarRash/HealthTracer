import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { HabitsModule } from "../habits/habits.module.js";
import { NutritionModule } from "../nutrition/nutrition.module.js";
import { UsersModule } from "../users/users.module.js";
import { WorkoutsModule } from "../workouts/workouts.module.js";
import { TodayController } from "./today.controller.js";
import { TodayRepository } from "./today.repository.js";
import { TodayService } from "./today.service.js";

@Module({
  imports: [DatabaseModule, UsersModule, WorkoutsModule, HabitsModule, NutritionModule],
  controllers: [TodayController],
  providers: [TodayRepository, TodayService],
  exports: [TodayService, TodayRepository],
})
export class TodayModule {}
