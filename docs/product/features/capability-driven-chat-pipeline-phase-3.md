# Capability-Driven Chat Pipeline (Phase 3)

## Problem

Phase 2 introduced deterministic preprocessing, system planning, response-mode policy, and proposal-only action resolution, but every non-crisis turn still depends on the coach LLM loop for final responses. This keeps latency and cost higher than necessary for explicit deterministic requests and does not yet support safe direct execution for simple "do it now" Today commands.

## Goal

Add a narrow capability/policy-driven Phase 3 path for:

- 0-LLM direct read responses for explicit "today" status questions.
- Explicit direct action for marking today's workout checklist task done when it is deterministic and safe.

This phase must preserve structured-state authority and keep plan-level changes proposal-gated.

## Safety Rule (Hard Requirement)

- Direct action runs only for **explicit user commands**.
- Any ambiguous or implicit mutation request must not execute directly.
- Workout/nutrition/habit/goal plan changes remain **proposal-only** and require user approval.

## Narrow MVP Scope (Recommended)

### In Scope

1. **0-LLM direct read: "What is today?"**
   - Route explicit Today summary queries to a deterministic read path.
   - Use existing Today domain read (`getOrGenerateDay`) and render a deterministic assistant summary (no coach LLM call).

2. **Explicit direct action: mark today's workout done**
   - Support explicit commands equivalent to "mark today's workout done/complete".
   - Execute only when exactly one valid target workout checklist item is resolvable for today.
   - Apply through existing Today domain update (`updateItemStatus` -> `completed`), not through proposal apply flow.
   - If zero or multiple candidates exist, do not mutate; return a clarification response.

3. **Frontend feedback and state refresh**
   - Return direct-path metadata in chat turn response (e.g., direct read/action outcome + refresh hints).
   - Invalidate Today/Dashboard/Longevity query keys when direct action succeeds so UI reflects updated checklist/workout state immediately.

4. **Integration coverage**
   - Add orchestration + chat integration tests for direct read, direct action success, and guarded no-op/clarification cases.

### Smallest Safe Implemented Subset (if command-target resolution is uncertain)

- Ship only:
  - direct read for explicit today-summary asks, and
  - direct action for explicit workout-done command when there is exactly one pending workout item.
- Defer free-form generic checklist-item completion until deterministic item targeting is proven safe.

## Explicit Non-Goals (Phase 3)

- No LLM-driven implicit mutations.
- No medical/document direct actions.
- No broad nutrition logging direct actions unless existing domain service semantics are proven deterministic and safe.
- No generic chat widget/action framework.
- No replacement of proposal validation, consent, crisis boundaries, or approval-before-apply safeguards.

## Acceptance Criteria

1. Explicit today-summary asks can complete via a 0-LLM deterministic path and return a valid chat assistant response.
2. Explicit workout-done commands execute direct action only when deterministic target resolution succeeds.
3. Ambiguous/implicit mutation requests are blocked from direct execution and return safe clarification (no state change).
4. Successful direct action writes through existing Today domain APIs and persists expected checklist/workout status updates.
5. Plan-changing requests (workout/nutrition/habit/goal changes) still return proposals only; no direct mutation path is introduced.
6. Chat response contract includes enough metadata for frontend feedback and targeted query invalidation.
7. Web chat applies refresh behavior for direct-action success, and user-visible feedback indicates execution result.
8. Integration tests cover success, ambiguity/no-op, and safety-boundary regression paths for Phase 3 additions.

## Risks, Assumptions, Open Questions

- **Risk:** false-positive command detection could trigger unintended mutation.
- **Risk:** timezone/day-boundary mismatches could target the wrong day.
- **Risk:** ambiguous workout/checklist targeting (multiple pending items) can degrade UX if not handled clearly.
- **Assumption:** existing Today service APIs (`getOrGenerateDay`, `updateItemStatus`) remain stable and are the only write path used.
- **Open question:** whether to include deterministic checklist-item-by-label completion now or defer to a later phase with explicit item identifiers.

## Recommended Implementation Slices (Subagent-Sized, <30% Context Each)

1. **Types + Policy Contract Slice**
   - Add minimal typed contract for direct-path outcomes and frontend refresh hints in shared types.
   - Keep changes strictly additive and backward-compatible.

2. **Deterministic Command Detection Slice**
   - Extend preprocessing/planning to identify explicit today-read and workout-done direct intents.
   - Ensure ambiguous commands resolve to safe fallback (no direct mutation).

3. **0-LLM Direct Read Executor Slice**
   - Implement deterministic today-summary read path in AI orchestration using Today domain read service.
   - Produce stable, testable response formatting and metadata.

4. **Direct Action Executor Slice**
   - Implement explicit workout-done execution path using Today domain update service.
   - Enforce deterministic single-target requirement and guarded no-op clarification behavior.

5. **Chat Contract + Frontend Refresh Slice**
   - Thread direct-path metadata through chat API response.
   - Update web chat state handling to show direct-action feedback and invalidate relevant query keys.

6. **Backend Integration Test Slice**
   - Add integration tests for: direct read success, direct action success, ambiguous target no-op, and proposal-only invariants.

7. **Frontend Integration/State Test Slice**
   - Add tests validating direct-action feedback rendering and expected query invalidation/state refresh behavior.

Each slice is intentionally narrow and can be assigned independently while staying below the target context threshold.
