import {
  findReusableWorkoutSession,
  findWorkoutPlanDayForWeekday,
  isStructuredWorkoutSessionExercise,
  normalizeWorkoutPlanExerciseEntry,
  normalizeWorkoutSessionExercises,
  resolveWeekdayFromIsoDate,
  toWorkoutSessionExercisePrescription,
  type TodayWorkoutDetail,
  type WorkoutPlanDay,
  type WorkoutPlanRevision,
  type WorkoutSession,
  type WorkoutSessionExercise,
} from "@health/types";

export function buildSessionExercisesFromPlanDay(day: WorkoutPlanDay): WorkoutSessionExercise[] {
  return day.exercises.map((entry) => {
    const normalized = normalizeWorkoutPlanExerciseEntry(entry);

    return {
      id: crypto.randomUUID(),
      exerciseId: normalized.exerciseId ?? null,
      prescription: toWorkoutSessionExercisePrescription(normalized),
      execution: { status: "planned" },
    };
  });
}

export function buildSessionTitle(planTitle: string, focus: string): string {
  const combined = `${planTitle} — ${focus}`;

  return combined.length <= 160 ? combined : focus.slice(0, 160);
}

export function toTodayWorkoutDetail(
  session: WorkoutSession,
  weekday: TodayWorkoutDetail["weekday"],
  focus: string,
): TodayWorkoutDetail {
  // Planned sessions (source = 'planned') always have workoutPlanId and
  // workoutPlanRevisionId. Ad-hoc sessions are not surfaced through TodayWorkoutDetail.
  if (!session.workoutPlanId || !session.workoutPlanRevisionId) {
    throw new Error(
      `toTodayWorkoutDetail: session ${session.id} is missing workoutPlanId or workoutPlanRevisionId (source=${session.source}).`,
    );
  }

  return {
    sessionId: session.id,
    workoutPlanId: session.workoutPlanId,
    workoutPlanRevisionId: session.workoutPlanRevisionId,
    plannedDate: session.plannedDate,
    weekday,
    title: session.title,
    focus,
    status: session.status,
    exercises: normalizeWorkoutSessionExercises(session.id, session.exercises),
    isRestDay: false,
  };
}

export interface ResolveTodayWorkoutContext {
  plannedDate: string;
  plan: { id: string; activeRevisionId: string | null };
  activeRevision: WorkoutPlanRevision | null;
  existingSessions: readonly WorkoutSession[];
}

export interface ResolvedTodayWorkout {
  weekday: ReturnType<typeof resolveWeekdayFromIsoDate>;
  planDay: WorkoutPlanDay | null;
  reusableSession: WorkoutSession | null;
  shouldMaterialize: boolean;
  sessionTitle: string | null;
  sessionExercises: WorkoutSessionExercise[];
}

export function resolveTodayWorkoutFromPlan(
  context: ResolveTodayWorkoutContext,
): ResolvedTodayWorkout | null {
  const { plannedDate, plan, activeRevision, existingSessions } = context;

  if (!activeRevision || !plan.activeRevisionId) {
    return null;
  }

  const weekday = resolveWeekdayFromIsoDate(plannedDate);
  const planDay = findWorkoutPlanDayForWeekday(activeRevision.payload, weekday);

  if (!planDay || planDay.exercises.length === 0) {
    return {
      weekday,
      planDay,
      reusableSession: null,
      shouldMaterialize: false,
      sessionTitle: null,
      sessionExercises: [],
    };
  }

  const reusableSession = findReusableWorkoutSession(existingSessions, {
    workoutPlanId: plan.id,
    workoutPlanRevisionId: activeRevision.id,
    plannedDate,
  });

  if (reusableSession) {
    return {
      weekday,
      planDay,
      reusableSession,
      shouldMaterialize: false,
      sessionTitle: reusableSession.title,
      sessionExercises: reusableSession.exercises.filter(isStructuredWorkoutSessionExercise),
    };
  }

  return {
    weekday,
    planDay,
    reusableSession: null,
    shouldMaterialize: true,
    sessionTitle: buildSessionTitle(activeRevision.payload.title, planDay.focus),
    sessionExercises: buildSessionExercisesFromPlanDay(planDay),
  };
}

export function mergeExerciseExecutionUpdate(
  exercise: WorkoutSessionExercise,
  input: {
    status?: WorkoutSessionExercise["execution"]["status"];
    notes?: string | null;
    actualWeightKg?: number | null;
    actualReps?: string | null;
    loadAdjustmentNotes?: string | null;
    perceivedEffort?: number | null;
    perceivedDifficulty?: number | null;
    discomfortFlag?: boolean | null;
  },
): WorkoutSessionExercise {
  return {
    ...exercise,
    execution: {
      ...exercise.execution,
      ...(input.status != null ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.actualWeightKg !== undefined ? { actualWeightKg: input.actualWeightKg } : {}),
      ...(input.actualReps !== undefined ? { actualReps: input.actualReps } : {}),
      ...(input.loadAdjustmentNotes !== undefined
        ? { loadAdjustmentNotes: input.loadAdjustmentNotes }
        : {}),
      ...(input.perceivedEffort !== undefined ? { perceivedEffort: input.perceivedEffort } : {}),
      ...(input.perceivedDifficulty !== undefined
        ? { perceivedDifficulty: input.perceivedDifficulty }
        : {}),
      ...(input.discomfortFlag !== undefined ? { discomfortFlag: input.discomfortFlag } : {}),
    },
  };
}

export function updateStructuredSessionExercise(
  exercises: WorkoutSession["exercises"],
  exerciseId: string,
  input: Parameters<typeof mergeExerciseExecutionUpdate>[1],
): WorkoutSession["exercises"] {
  let found = false;

  const updated = exercises.map((entry) => {
    if (!isStructuredWorkoutSessionExercise(entry) || entry.id !== exerciseId) {
      return entry;
    }

    found = true;
    return mergeExerciseExecutionUpdate(entry, input);
  });

  if (!found) {
    return exercises;
  }

  return updated;
}
