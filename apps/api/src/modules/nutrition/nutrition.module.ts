import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { NutritionController } from "./nutrition.controller.js";
import { NutritionRepository } from "./nutrition.repository.js";
import { NutritionService } from "./nutrition.service.js";

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [NutritionController],
  providers: [
    NutritionRepository,
    NutritionService,
  ],
  exports: [NutritionService, NutritionRepository],
})
export class NutritionModule {}
