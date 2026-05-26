import { nutritionAdherence, nutritionIncidents, nutritionPlanRevisions, nutritionPlans } from "@health/db";
import {
  logNutritionIncidentProposalPayloadSchema,
  nutritionAdherenceStateSchema,
  nutritionPlanPayloadSchema,
  type LogNutritionIncidentProposalPayload,
  type NutritionAdherenceRecord,
  type NutritionAdherenceState,
  type NutritionIncidentRecord,
  type NutritionPlan,
  type NutritionPlanRevision,
  type NutritionTargetCompletion,
  type UpsertNutritionAdherenceInput,
} from "@health/types";
import { InternalServerErrorException } from "@nestjs/common";

type NutritionPlanRow = typeof nutritionPlans.$inferSelect;
type NutritionPlanRevisionRow = typeof nutritionPlanRevisions.$inferSelect;
type NutritionAdherenceRow = typeof nutritionAdherence.$inferSelect;
type NutritionIncidentRow = typeof nutritionIncidents.$inferSelect;

export function toNutritionPlan(row: NutritionPlanRow): NutritionPlan {
  return {
    id: row.id,
    userId: row.userId,
    activeRevisionId: row.activeRevisionId,
    status: row.status as NutritionPlan["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toNutritionPlanRevision(
  row: NutritionPlanRevisionRow,
): NutritionPlanRevision {
  const parsedPayload = nutritionPlanPayloadSchema.safeParse(row.payload);

  if (!parsedPayload.success) {
    throw new InternalServerErrorException("Invalid stored nutrition revision payload.");
  }

  return {
    id: row.id,
    nutritionPlanId: row.nutritionPlanId,
    revisionNumber: row.revisionNumber,
    reason: row.reason,
    source: row.source,
    payload: parsedPayload.data,
    createdAt: row.createdAt.toISOString(),
  };
}

function parseAdherenceState(
  date: string,
  row: Pick<
    NutritionAdherenceRow,
    "hydrationLitersConsumed" | "mealCompletion" | "targetCompletion" | "notes"
  >,
): NutritionAdherenceState {
  const parsed = nutritionAdherenceStateSchema.safeParse({
    date,
    hydrationLitersConsumed: row.hydrationLitersConsumed,
    mealCompletion: row.mealCompletion,
    targetCompletion: row.targetCompletion,
    notes: row.notes,
  });

  if (!parsed.success) {
    throw new InternalServerErrorException("Invalid stored nutrition adherence payload.");
  }

  return parsed.data;
}

export function toNutritionAdherenceRecord(row: NutritionAdherenceRow): NutritionAdherenceRecord {
  return {
    ...parseAdherenceState(row.date, row),
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mergeAdherenceInput(
  date: string,
  existing: NutritionAdherenceRow | null,
  input: UpsertNutritionAdherenceInput,
): NutritionAdherenceState {
  const current = existing
    ? parseAdherenceState(date, existing)
    : nutritionAdherenceStateSchema.parse({ date });

  return nutritionAdherenceStateSchema.parse({
    date,
    hydrationLitersConsumed:
      input.hydrationLitersConsumed !== undefined
        ? input.hydrationLitersConsumed
        : current.hydrationLitersConsumed,
    mealCompletion: input.mealCompletion ?? current.mealCompletion,
    targetCompletion: {
      ...current.targetCompletion,
      ...(input.targetCompletion ?? {}),
    } satisfies NutritionTargetCompletion,
    notes: input.notes ?? current.notes,
  });
}

export function adherenceStateToRowValues(state: NutritionAdherenceState) {
  return {
    hydrationLitersConsumed: state.hydrationLitersConsumed,
    mealCompletion: state.mealCompletion,
    targetCompletion: state.targetCompletion,
    notes: state.notes,
  };
}

export function toNutritionIncidentRecord(row: NutritionIncidentRow): NutritionIncidentRecord {
  const payload = logNutritionIncidentProposalPayloadSchema.safeParse({
    incidentDateTime: row.incidentDateTime.toISOString(),
    items: row.items,
    estimatedCalories: row.estimatedCalories,
    estimatedMacros: row.estimatedMacros,
    confidence: row.confidence,
    provenance: row.provenance,
    imageRefs: row.imageRefs,
    userEdits: row.userEdits,
  });

  if (!payload.success) {
    throw new InternalServerErrorException("Invalid stored nutrition incident payload.");
  }

  return {
    id: row.id,
    userId: row.userId,
    incidentDateTime: row.incidentDateTime.toISOString(),
    date: row.date,
    items: payload.data.items,
    estimatedCalories: payload.data.estimatedCalories,
    estimatedMacros: payload.data.estimatedMacros,
    confidence: payload.data.confidence,
    provenance: payload.data.provenance,
    imageRefs: payload.data.imageRefs,
    userEdits: payload.data.userEdits ?? null,
    sourceProposalId: row.sourceProposalId,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
