import { Module } from "@nestjs/common";
import { AiBehaviorModule } from "../ai/ai-behavior.module.js";
import { DocumentsModule } from "../documents/documents.module.js";
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
import { createContextCompressionProvider } from "./context-compression.factory.js";
import { ContextCompressionService } from "./context-compression.service.js";
import {
  CONTEXT_COMPRESSION_FALLBACK_PROVIDER,
  CONTEXT_COMPRESSION_PROVIDER,
} from "./context-compression.tokens.js";
import { ContextExpansionPolicyService } from "./context-expansion-policy.service.js";
import { StubContextCompressionProvider } from "./stub-context-compression.provider.js";

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
    DocumentsModule,
    HealthMetricsModule,
    WellbeingCheckInsModule,
    RecoveryModule,
  ],
  providers: [
    ContextBudgetPolicyService,
    StubContextCompressionProvider,
    {
      provide: CONTEXT_COMPRESSION_PROVIDER,
      useFactory: () => createContextCompressionProvider(),
    },
    {
      provide: CONTEXT_COMPRESSION_FALLBACK_PROVIDER,
      useExisting: StubContextCompressionProvider,
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
