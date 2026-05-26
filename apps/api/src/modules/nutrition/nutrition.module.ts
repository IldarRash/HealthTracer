import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { NutritionController } from "./nutrition.controller.js";
import {
  DevFoodPhotoAnalysisProvider,
  FoodPhotoAnalysisService,
} from "./food-photo-analysis.service.js";
import { NutritionRepository } from "./nutrition.repository.js";
import { NutritionService } from "./nutrition.service.js";

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [NutritionController],
  providers: [
    NutritionRepository,
    DevFoodPhotoAnalysisProvider,
    FoodPhotoAnalysisService,
    NutritionService,
  ],
  exports: [NutritionService, NutritionRepository, FoodPhotoAnalysisService],
})
export class NutritionModule {}
