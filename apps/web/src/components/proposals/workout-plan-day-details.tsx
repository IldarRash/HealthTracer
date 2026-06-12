"use client";

import { useId, useState } from "react";
import {
  formatWorkoutExercisePrescription,
  type WorkoutDaySummary,
} from "../../lib/proposal-change-summary";
import { Icon } from "../ui";

type WorkoutPlanDayDetailsProps = {
  days: WorkoutDaySummary[];
};

type WorkoutPlanDayRowProps = {
  day: WorkoutDaySummary;
};

/**
 * One expandable day row: the button header is the flat day summary line
 * ("Monday: Upper body (5 exercises)"); the expanded body lists each exercise
 * as "name — sets×reps" (or "Nmin" for duration-based entries).
 */
function WorkoutPlanDayRow({ day }: WorkoutPlanDayRowProps) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="workout-plan-day">
      <button
        type="button"
        className="workout-plan-day__toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="workout-plan-day__label">{day.label}</span>
        <Icon
          name={expanded ? "chevD" : "chevR"}
          size={14}
          className="workout-plan-day__chevron"
          aria-hidden
        />
      </button>
      <ul
        id={panelId}
        hidden={!expanded}
        className="detail-line-list workout-plan-day__exercises"
      >
        {day.exercises.map((exercise, index) => {
          const prescription = formatWorkoutExercisePrescription(exercise);

          return (
            <li key={`${exercise.name}-${index}`}>
              {prescription ? `${exercise.name} — ${prescription}` : exercise.name}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

/**
 * Expandable per-day breakdown for workout-plan proposal cards. Replaces the
 * flat day summary strings in the change-summary "After" list with
 * keyboard-accessible disclosure rows (same header copy).
 */
export function WorkoutPlanDayDetails({ days }: WorkoutPlanDayDetailsProps) {
  if (days.length === 0) {
    return null;
  }

  return (
    <ul className="workout-plan-day-list">
      {days.map((day, index) => (
        <WorkoutPlanDayRow key={`${day.label}-${index}`} day={day} />
      ))}
    </ul>
  );
}
