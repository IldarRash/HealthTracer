"use client";

import { isStructuredWorkoutPlanExercise, type WorkoutPlanExerciseEntry } from "@health/types";
import {
  formatPlanExercisePrescriptionDetailLines,
  resolvePlanExerciseCatalogMetadata,
} from "../../lib/exercise-catalog-ui-state";
import { formatExerciseLabel } from "../../lib/training-ui-state";
import { DetailLineList, ExerciseCatalogDetails } from "../ui";

type TrainingPlanExerciseItemProps = {
  exercise: WorkoutPlanExerciseEntry;
};

export function TrainingPlanExerciseItem({ exercise }: TrainingPlanExerciseItemProps) {
  const catalog = resolvePlanExerciseCatalogMetadata(exercise);
  const prescriptionLines =
    typeof exercise !== "string" && isStructuredWorkoutPlanExercise(exercise)
      ? formatPlanExercisePrescriptionDetailLines(exercise)
      : [];

  return (
    <li className="training-plan-exercise nested-card">
      <strong className="training-plan-exercise-title">{formatExerciseLabel(exercise)}</strong>

      <DetailLineList
        lines={prescriptionLines}
        className="training-exercise-prescription-details"
      />

      {catalog ? <ExerciseCatalogDetails catalog={catalog} /> : null}
    </li>
  );
}
