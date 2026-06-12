import {
  adaptWorkoutPlanFromProgressChangesSchema,
  normalizeLogNutritionIncidentChanges,
  workoutPlanProposalChangesSchema,
  type ProposalIntent,
} from "@health/types";
import { Injectable, Logger } from "@nestjs/common";
import { ExercisesService } from "../exercises/exercises.service.js";
import {
  hasLegacyExerciseEntries,
  normalizeLegacyWorkoutPlanExercises,
} from "../workouts/workout-exercise-normalizer.js";

/**
 * Server-side turn state used to stamp trusted values into normalized payloads.
 * Built once per chat turn by ChatService — never sourced from LLM output.
 */
export interface ProposalNormalizationContext {
  userId: string;
  /** Server-side "now" for this turn, ISO-8601 UTC. */
  nowIso: string;
  /** Bounded metadata of the attachments uploaded on this turn. */
  turnAttachments: ReadonlyArray<{ id: string; mimeType: string; category: string }>;
}

/**
 * Per-intent proposal normalization registry.
 *
 * Bridges known LLM shape variance in raw proposal payloads into the canonical
 * form BEFORE the validation stack runs. Normalizers bridge, they do not relax:
 * the full `ProposalValidationService` stack still runs on the normalized
 * payload afterwards.
 *
 * Fault isolation: a failing normalizer returns the ORIGINAL changes and logs a
 * warning (intent + error name only — never payload contents). Validation
 * may then mark the proposal invalid, but the turn survives.
 */
@Injectable()
export class ProposalNormalizationService {
  private readonly logger = new Logger(ProposalNormalizationService.name);

  constructor(private readonly exercisesService: ExercisesService) {}

  async normalizeProposal(
    intent: ProposalIntent,
    proposedChanges: unknown,
    ctx: ProposalNormalizationContext,
  ): Promise<unknown> {
    try {
      switch (intent) {
        case "create_workout_plan":
        case "adapt_workout_plan":
          return await this.normalizeWorkoutPlanChanges(ctx.userId, proposedChanges);
        case "adapt_workout_plan_from_progress":
          return await this.normalizeFromProgressWorkoutChanges(ctx.userId, proposedChanges);
        case "log_nutrition_incident":
          return normalizeLogNutritionIncidentChanges(proposedChanges, {
            nowIso: ctx.nowIso,
            imageAttachmentIds: ctx.turnAttachments
              .filter((attachment) => attachment.mimeType.startsWith("image/"))
              .map((attachment) => attachment.id),
          });
        default:
          return proposedChanges;
      }
    } catch (error) {
      // Privacy floor: log intent + error name only — never payload contents
      // (raw error messages from DB drivers can embed payload values).
      this.logger.warn("Proposal normalization failed — using original changes", {
        intent,
        error: error instanceof Error ? error.name : "unknown",
      });

      return proposedChanges;
    }
  }

  /**
   * Bridge legacy `{name, reps, sets}` exercise entries in a workout-plan
   * payload to the structured catalog-backed form. Returns the original
   * reference when the payload does not parse or has no legacy entries.
   */
  private async normalizeWorkoutPlanChanges(
    userId: string,
    proposedChanges: unknown,
  ): Promise<unknown> {
    const parsed = workoutPlanProposalChangesSchema.safeParse(proposedChanges);

    if (!parsed.success) {
      return proposedChanges;
    }

    if (!hasLegacyExerciseEntries(parsed.data)) {
      return proposedChanges;
    }

    const { changes } = await normalizeLegacyWorkoutPlanExercises(
      this.exercisesService,
      userId,
      parsed.data,
    );

    return changes;
  }

  /**
   * Same bridge for adapt_workout_plan_from_progress: the legacy name-only
   * exercises live on the wrapper's nested `.plan`, so the wrapper is parsed
   * and the nested plan normalized in place. Returns the original reference
   * when the payload does not parse or has no legacy entries.
   */
  private async normalizeFromProgressWorkoutChanges(
    userId: string,
    proposedChanges: unknown,
  ): Promise<unknown> {
    const parsed = adaptWorkoutPlanFromProgressChangesSchema.safeParse(proposedChanges);

    if (!parsed.success) {
      return proposedChanges;
    }

    if (!hasLegacyExerciseEntries(parsed.data.plan)) {
      return proposedChanges;
    }

    const { changes } = await normalizeLegacyWorkoutPlanExercises(
      this.exercisesService,
      userId,
      parsed.data.plan,
    );

    return { ...parsed.data, plan: changes };
  }
}
