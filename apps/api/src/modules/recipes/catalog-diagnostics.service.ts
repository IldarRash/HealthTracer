import { exercises, habitTemplates, recipes } from "@health/db";
import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { count, eq } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";
import { writeStructuredLog } from "../../observability/structured-logger.js";

/**
 * Logs catalog row counts once at startup so an empty-catalog boot is
 * immediately visible in structured logs. Non-blocking: query failures are
 * caught and logged as warnings without crashing the application.
 */
@Injectable()
export class CatalogDiagnosticsService implements OnModuleInit {
  private readonly logger = new Logger(CatalogDiagnosticsService.name);

  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async onModuleInit(): Promise<void> {
    try {
      const [recipesRow, exercisesRow, habitTemplatesRow] = await Promise.all([
        this.db
          .select({ value: count() })
          .from(recipes)
          .where(eq(recipes.status, "active"))
          .then(([row]) => row?.value ?? 0),
        this.db
          .select({ value: count() })
          .from(exercises)
          .where(eq(exercises.status, "active"))
          .then(([row]) => row?.value ?? 0),
        this.db
          .select({ value: count() })
          .from(habitTemplates)
          .where(eq(habitTemplates.status, "active"))
          .then(([row]) => row?.value ?? 0),
      ]);

      writeStructuredLog({
        level: "info",
        message: "Catalog readiness counts",
        event: "startup.catalog_counts",
        integrations: {
          activeRecipes: String(recipesRow),
          activeExercises: String(exercisesRow),
          activeHabitTemplates: String(habitTemplatesRow),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Catalog diagnostics query failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
