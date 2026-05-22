import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { NutritionModule } from "../nutrition/nutrition.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { UsersModule } from "../users/users.module.js";
import { RecipesController } from "./recipes.controller.js";
import { RecipesRepository } from "./recipes.repository.js";
import { RecipesService } from "./recipes.service.js";

@Module({
  imports: [DatabaseModule, UsersModule, NutritionModule, ProfilesModule],
  controllers: [RecipesController],
  providers: [RecipesRepository, RecipesService],
  exports: [RecipesService, RecipesRepository],
})
export class RecipesModule {}
