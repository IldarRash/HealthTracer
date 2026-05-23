import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { ExercisesController } from "./exercises.controller.js";
import { ExercisesRepository } from "./exercises.repository.js";
import { ExercisesService } from "./exercises.service.js";

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [ExercisesController],
  providers: [ExercisesRepository, ExercisesService],
  exports: [ExercisesService, ExercisesRepository],
})
export class ExercisesModule {}
