import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { WorkoutsModule } from "../workouts/workouts.module.js";
import { ProgressController } from "./progress.controller.js";
import { ProgressRepository } from "./progress.repository.js";
import { ProgressService } from "./progress.service.js";

@Module({
  imports: [DatabaseModule, UsersModule, WorkoutsModule],
  controllers: [ProgressController],
  providers: [ProgressRepository, ProgressService],
  exports: [ProgressService, ProgressRepository],
})
export class ProgressModule {}
