import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { ExercisesModule } from "../exercises/exercises.module.js";
import { UsersModule } from "../users/users.module.js";
import { WorkoutsController } from "./workouts.controller.js";
import { WorkoutsRepository } from "./workouts.repository.js";
import { WorkoutsService } from "./workouts.service.js";

@Module({
  imports: [DatabaseModule, UsersModule, ExercisesModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsRepository, WorkoutsService],
  exports: [WorkoutsService, WorkoutsRepository],
})
export class WorkoutsModule {}
