import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { HabitsController } from "./habits.controller.js";
import { HabitsRepository } from "./habits.repository.js";
import { HabitsService } from "./habits.service.js";

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [HabitsController],
  providers: [HabitsRepository, HabitsService],
  exports: [HabitsService, HabitsRepository],
})
export class HabitsModule {}
