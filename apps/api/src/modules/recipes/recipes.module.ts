import { Module, forwardRef } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { NutritionModule } from "../nutrition/nutrition.module.js";
import { ProposalsModule } from "../proposals/proposals.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { UsersModule } from "../users/users.module.js";
import {
  resolveRecipeCatalogProviderMode,
  SeededOnlyRecipeCatalogProvider,
} from "./recipe-catalog.config.js";
import { RECIPE_CATALOG_PROVIDER } from "./recipe-catalog.tokens.js";
import { RecipesController } from "./recipes.controller.js";
import { RecipesRepository } from "./recipes.repository.js";
import { RecipesService } from "./recipes.service.js";
import { TheMealDbCatalogProvider } from "./themealdb-catalog-provider.js";

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    NutritionModule,
    ProfilesModule,
    forwardRef(() => ProposalsModule),
  ],
  controllers: [RecipesController],
  providers: [
    RecipesRepository,
    RecipesService,
    TheMealDbCatalogProvider,
    SeededOnlyRecipeCatalogProvider,
    {
      provide: RECIPE_CATALOG_PROVIDER,
      useFactory: (
        themealdb: TheMealDbCatalogProvider,
        seededOnly: SeededOnlyRecipeCatalogProvider,
      ) => {
        return resolveRecipeCatalogProviderMode() === "seeded_only" ? seededOnly : themealdb;
      },
      inject: [TheMealDbCatalogProvider, SeededOnlyRecipeCatalogProvider],
    },
  ],
  exports: [RecipesService, RecipesRepository],
})
export class RecipesModule {}
