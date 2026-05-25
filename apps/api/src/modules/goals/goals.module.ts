import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { GoalsController } from "./goals.controller.js";
import { GoalsRepository } from "./goals.repository.js";
import { GoalsService } from "./goals.service.js";

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [GoalsController],
  providers: [GoalsRepository, GoalsService],
  exports: [GoalsService, GoalsRepository],
})
export class GoalsModule {}
