import { Module } from "@nestjs/common";
import { env } from "../../env.js";
import { AiBehaviorModule } from "../ai/ai-behavior.module.js";
import { BiomarkersModule } from "../biomarkers/biomarkers.module.js";
import { GoalsModule } from "../goals/goals.module.js";
import { HealthMetricsModule } from "../health-metrics/health-metrics.module.js";
import { RecoveryModule } from "../recovery/recovery.module.js";
import { WellbeingCheckInsModule } from "../wellbeing-check-ins/wellbeing-check-ins.module.js";
import { HabitsModule } from "../habits/habits.module.js";
import { NutritionModule } from "../nutrition/nutrition.module.js";
import { ProgressModule } from "../progress/progress.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { UsersModule } from "../users/users.module.js";
import { WorkoutsModule } from "../workouts/workouts.module.js";
import { CoachingContextService } from "./coaching-context.service.js";
import { ContextBudgetPolicyService } from "./context-budget-policy.service.js";
import { ContextCompressionService } from "./context-compression.service.js";
import { CONTEXT_COMPRESSION_PROVIDER } from "./context-compression.tokens.js";
import { ContextExpansionPolicyService } from "./context-expansion-policy.service.js";
import { OpenAiContextCompressionProvider } from "./openai-context-compression.provider.js";

@Module({
  imports: [
    AiBehaviorModule,
    UsersModule,
    ProfilesModule,
    GoalsModule,
    WorkoutsModule,
    NutritionModule,
    HabitsModule,
    ProgressModule,
    BiomarkersModule,
    HealthMetricsModule,
    WellbeingCheckInsModule,
    RecoveryModule,
  ],
  providers: [
    ContextBudgetPolicyService,
    {
      provide: CONTEXT_COMPRESSION_PROVIDER,
      useFactory: () => {
        if (env.AI_COACH_PROVIDER === "openai" && env.OPENAI_API_KEY) {
          return new OpenAiContextCompressionProvider({
            apiKey: env.OPENAI_API_KEY,
            model: env.OPENAI_MODEL,
          });
        }

        // No provider available (missing key); ContextCompressionService degrades to
        // summary:null via @Optional() injection (S2).
        return undefined;
      },
    },
    ContextCompressionService,
    ContextExpansionPolicyService,
    CoachingContextService,
  ],
  exports: [
    ContextBudgetPolicyService,
    ContextCompressionService,
    ContextExpansionPolicyService,
    CoachingContextService,
  ],
})
export class CoachingContextModule {}
