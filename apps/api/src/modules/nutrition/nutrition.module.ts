import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { GroceryDerivationService } from "./grocery-derivation.service.js";
import { NutritionController } from "./nutrition.controller.js";
import { NutritionRepository } from "./nutrition.repository.js";
import { NutritionService } from "./nutrition.service.js";

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [NutritionController],
  providers: [
    NutritionRepository,
    GroceryDerivationService,
    NutritionService,
  ],
  exports: [NutritionService, NutritionRepository, GroceryDerivationService],
})
export class NutritionModule {}
