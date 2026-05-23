# Workout AI Program Enhancements

## Summary

This feature upgrades workouts from a loose plan checklist into a structured, AI-adaptable training system. The product should support goal-based workout plans, a starter exercise catalog, AI-created exercises that are saved into the catalog, automatic weekday mapping from the active plan to Today, and workout execution where users can start the current day's workout and check off completed exercises.

The selected scope is to seed an initial exercise catalog now and persist AI-generated exercises as owned structured data. Today should derive the concrete workout automatically from the active workout plan by weekday, not from manual session scheduling.

## Problem

Workout plans currently support high-level plan days and scheduled sessions, but the user wants flexible AI workout intentions comparable to recipe support: the coach should be able to create plans for different goals, choose from known exercises, introduce new exercises safely, and adapt plans when the user asks to remove exercises or reduce load.

The execution loop is also split incorrectly for the desired UX. Workouts should be a simple day-by-day program and weekly progress view, while Today should be the place where the user sees the exact workout for the current day, starts it, and marks exercises complete.

## Target UX

- Chat remains the entry point for requests such as "create a fat-loss gym plan", "make this easier", "remove burpees", "reduce load this week", "swap equipment", or "make a home workout".
- AI workout proposals appear as typed, reviewable changes; accepted changes create workout plan revisions.
- Workouts tab shows the active program by day, including exercise names, muscles, equipment, workout type, sets, reps, recommended weight/load guidance, rest within circuits, and rest between sets or reps where applicable.
- Workouts tab also shows weekly progress, adherence, completed sessions, skipped work, and current revision context.
- Today automatically shows the workout assigned to the current weekday from the active plan in the user's timezone.
- Today lets the user start the day's workout, view the concrete exercise list, and check off exercise-level completion.
- Today completion updates workout progress without requiring the user to manually schedule the session first.

## User Stories

- As a user, I can ask the coach to create a workout plan for fat loss, muscle gain, endurance, maintenance, general wellness, home training, gym training, low equipment, or other supported constraints.
- As a user, I can see a day-by-day workout program in Workouts without managing a calendar manually.
- As a user, I can open Today and immediately see the workout assigned to this weekday.
- As a user, I can start today's workout and mark each exercise complete, skipped, or adjusted.
- As a user, I can ask the coach to remove an exercise or reduce load and review the proposed revised plan before it changes my active program.
- As a user, I can receive AI-created exercises when the catalog does not have a suitable option, and those exercises become reusable structured records.

## In Scope

- Starter seeded exercise catalog with at least name, primary muscles, secondary muscles, equipment, movement pattern or type, difficulty, and safety/form notes.
- Persisted custom/AI-generated exercise records with source metadata and validation status.
- Workout plan payloads that reference exercise IDs where possible and can include newly created AI exercises.
- Structured workout day definitions mapped to weekdays for automatic Today generation.
- Exercise prescription fields for sets, reps, rep ranges, recommended weight/load guidance, rest between sets, rest between reps when relevant, circuit grouping, rest inside circuits, and rest between circuit rounds.
- AI intents for creating goal-based workout plans and adapting active plans by removing exercises, swapping exercises, reducing volume, reducing load, or adjusting rest.
- Today workout derivation from the active plan by weekday.
- Exercise-level workout execution state in Today.
- Workouts tab simplification to active day-by-day program plus weekly progress.

## Non-Goals

- Manual calendar scheduling as the primary path for plan execution.
- Wearable-based load auto-regulation or device sync.
- Advanced periodization, one-rep-max estimation, velocity-based training, or medical rehabilitation protocols.
- Diagnosis, treatment, injury triage, or clinical claims.
- A large public exercise marketplace or social exercise sharing.
- Replacing user approval with silent AI plan mutation.

## Acceptance Criteria

- A seeded exercise catalog exists and can be queried by backend services and AI planning tools.
- Exercise records include muscle groups, equipment, exercise type or movement pattern, and source metadata.
- AI-created exercises are persisted when an accepted workout proposal depends on an exercise not already in the catalog.
- Duplicate exercise creation is minimized through normalized names, aliases, equipment, and muscle metadata.
- Workout plans store a weekly/day-by-day structure with stable weekday assignment.
- Workout plan exercises include structured prescription data: sets, reps or time, recommended load guidance, rest rules, and circuit grouping when used.
- AI-created or AI-adapted workout proposals are validated before persistence and require user approval before changing active plan state.
- Accepting a workout change creates a new workout plan revision, not an in-place overwrite.
- Today resolves the current workout from active plan plus user timezone and weekday.
- Today allows starting the workout and recording exercise-level completion.
- Completing Today workout exercises updates workout session/progress state and weekly progress summaries.
- Workouts tab does not require manual session scheduling to make Today useful.
- Workouts tab shows only active day-by-day program, revision context, and weekly progress for this scope.
- Rejected or pending AI proposals do not create active workout revisions or Today workouts.
- Safety copy stays in wellness and fitness coaching language and avoids diagnosis, treatment, or medical certainty.

## Data And API Implications

- Add an `exercises` catalog table owned by `packages/db`, with seed data managed by migrations or an idempotent seed script.
- Consider related catalog fields: `id`, `name`, `aliases`, `primaryMuscles`, `secondaryMuscles`, `equipment`, `types`, `difficulty`, `instructions`, `safetyNotes`, `source`, `status`, timestamps.
- Add a way to distinguish system-seeded exercises from AI-generated/user-specific exercises. If AI-generated exercises are not globally reviewed, keep them user-owned or mark them as unverified.
- Extend shared Zod schemas in `packages/types` for exercise catalog records, workout prescriptions, circuit metadata, and weekday-based plan days.
- Extend workout plan revisions so payloads reference catalog exercise IDs plus immutable display snapshots needed for historical revision readability.
- Preserve existing revision semantics for workout plans.
- Replace or de-emphasize manual session scheduling with a derived Today/session API that can materialize the current weekday workout on demand.
- Add API support for starting today's workout and updating exercise-level completion state.
- Ensure progress aggregation can compute weekly completion from derived/materialized workout execution records.

## AI Intent And Proposal Implications

- Keep `create_workout_plan` and `adapt_workout_plan`, but expand their schemas to support catalog-backed exercise prescriptions and weekday plans.
- Add or model sub-intents for common workout requests: remove exercise, swap exercise, reduce load, reduce volume, change equipment, change goal emphasis, adjust rest, and simplify workout.
- The AI should search the exercise catalog before proposing a new exercise.
- If the AI proposes a new exercise, the proposal must include structured exercise metadata and a reason it is needed.
- Proposal validation should reject unsupported prescription shapes, unsafe medical framing, missing weekday mapping, unknown exercise references, and load/rest values outside product-defined bounds.
- Applying an accepted proposal should persist required new exercises first, then create the workout plan revision that references them.
- Chat explanations can be flexible and conversational, but the plan, exercises, prescriptions, and execution state must be typed structured state.

## Safety Constraints

- Do not provide diagnosis, treatment, rehabilitation protocols, or injury-specific medical certainty.
- Adaptation copy should use coaching language such as "reduce intensity", "choose a lower load", or "pause and consult a professional if pain persists" without diagnosing causes.
- AI-generated exercises must include conservative instructions and safety notes before they can be saved.
- Load guidance should be framed as recommended starting guidance or perceived-effort guidance, not a guarantee.
- User constraints and preferences may guide exercise choice, but sensitive health documents or integrations require explicit consent before use.
- Avoid logging private health details, raw prompts containing sensitive context, or full user workout feedback in unsafe logs.

## Rollout Risks

- Catalog quality directly affects AI plan quality; a small starter seed should prioritize common, well-understood movements before breadth.
- AI-generated exercises can create duplicates or unsafe variants unless normalization and validation are strict.
- Weekday-derived Today workouts may conflict with users who expect flexible scheduling; this scope intentionally favors automatic weekday mapping.
- Exercise-level completion adds more state than session-level completion and may require careful migration from existing session records.
- Recommended weight is difficult without history; first rollout should support qualitative load guidance and optional numeric recommendations when context is available.
- Circuit rest modeling can become too complex; use a minimal schema that covers straight sets and simple circuits before advanced protocols.
- Existing Workouts UI includes manual scheduling; replacing that behavior may affect tests and user expectations.

## Initial Implementation Slices

1. Exercise catalog foundation: add schema, seed data, shared types, catalog query API, and tests for validation/deduplication rules.
2. Workout plan schema upgrade: extend plan payloads for weekday mapping, exercise references, prescription fields, and simple circuit/rest modeling while preserving revision history.
3. AI proposal upgrade: expand structured outputs and validation for create/adapt workout plans, including AI-generated exercise persistence on accepted proposals.
4. Today execution flow: derive the current workout from active plan by weekday, materialize/start today's workout, and record exercise-level completion.
5. Workouts/weekly progress UI: simplify Workouts to day-by-day program and weekly progress, removing manual scheduling as the primary flow.
6. Verification and safety pass: add focused tests for proposal approval, rejected proposal no-ops, catalog persistence, Today derivation, progress aggregation, and wellness-only copy.

## Open Questions

- Should AI-generated exercises be global after validation, or user-owned until reviewed?
- Which starter catalog size is enough for MVP: roughly 50, 100, or 200 exercises?
- Should weekday mapping be strict calendar weekdays, or plan day labels mapped to weekdays during proposal approval?
- What is the first supported recommended-weight format: free text, RPE/RIR guidance, percentage-based guidance, numeric range, or all of these with validation?
- Should skipped or partially completed exercises immediately influence AI adaptation suggestions, or only weekly summaries?
