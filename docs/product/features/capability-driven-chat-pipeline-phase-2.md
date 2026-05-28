# Capability-Driven Chat Pipeline (Phase 2)

## Problem

Phase 1 established typed capability configuration and registry-backed policy reads, but core chat orchestration still contains hardcoded flow logic for preprocessing, planning, response mode selection, and proposal-oriented action resolution. This limits how safely and quickly new capabilities can be introduced without touching backend domain branches.

## Goal

Introduce a capability-driven orchestration layer for preprocessing, planning, response mode selection, and proposal-only action resolution so the backend can execute policy from configuration rather than service-specific branching.

Phase 2 is still a controlled compatibility phase: AI may propose actions, but no direct structured-state mutation path is introduced.

## In Scope (Phase 2)

- Add a **preprocessor stage** that derives normalized turn inputs used by downstream planner/action flow.
- Add a **planner facade** that reads from `CapabilityRegistryService` and returns a capability-plan result for the turn.
- Add **response mode policy handling** (for example conversational vs proposal-oriented mode) sourced from capability policy.
- Add an **action resolver facade** that supports **proposal outputs only** and explicitly blocks direct mutation actions.
- Wire these components into backend orchestration with minimal behavior drift from Phase 1.
- Add focused backend/unit tests for happy path, fallback path, and safety gates.

## Explicit Non-Goals / Deferred Work

- **Deferred:** direct actions and 0-LLM paths.
- **Deferred:** frontend generic capability widgets.
- **Deferred:** full multi-capability composition/runtime chaining.
- **Deferred:** context compression strategies and compression infrastructure.
- Not in scope: replacing proposal validation, approval, consent, crisis boundaries, or structured-state authority rules.
- Not in scope: broad chat UX contract changes for this phase.

## Acceptance Criteria

- A preprocessor exists and is invoked before planning; it returns a typed/prevalidated turn input used by planner and resolver stages.
- Orchestration calls a planner facade over `CapabilityRegistryService` (instead of embedding equivalent planner logic directly in orchestration methods).
- Response mode is selected from capability policy and propagated through generation flow with safe fallback behavior.
- Action resolution is routed through a dedicated resolver facade that allows proposal intents only and rejects/blocks any direct mutation action type.
- Existing safety boundaries remain intact: crisis short-circuiting, consent requirements, proposal validation, and approval-before-apply behavior.
- Focused tests prove config-driven planner/mode behavior and resolver safeguards, including invalid/missing-policy fallback paths.
- `.cursor/plans/capability_chat_gap_140b3bfe.plan.md` is not edited.

## Risks, Assumptions, Open Questions

- Transitional split-brain risk: old branches and new facades can diverge if fallback precedence is unclear.
- Planner and response-mode defaults may accidentally over-route to generic behavior if capability policy is missing fields.
- Action resolver boundaries must stay strict to prevent accidental direct mutation capability creep.
- Assumption: existing capability config has enough metadata to derive response mode without introducing a broad schema rewrite.
- Open question: whether multi-attachment turns should yield one turn-level response mode or per-capability mode arbitration (defer implementation; document chosen temporary rule).

## Recommended Subagent Slices (Ordered, <30% Context Each)

1. **Backend Slice A - Preprocessor Foundation**
   - Add preprocessor contract/types and integration point before planner execution.
   - Normalize turn envelope inputs required for planner and action resolver.
   - Add narrow unit tests for typed output and invalid-input fallback.

2. **Backend Slice B - Planner Facade Over Registry**
   - Implement planner facade that resolves capability plan from `CapabilityRegistryService`.
   - Move planner decision reads out of orchestrator internals into facade boundaries.
   - Add tests for plan resolution, unknown capability fallback, and deterministic parity guardrails.

3. **Backend Slice C - Response Mode Policy Wiring**
   - Read response mode from capability policy and pass it through orchestration result contracts.
   - Preserve existing behavior when response mode is absent via explicit safe default.
   - Add tests for mode propagation and fallback/default precedence.

4. **Backend Slice D - Proposal-Only Action Resolver**
   - Implement resolver facade for action mapping that returns proposal-intent outputs only.
   - Enforce explicit rejection/blocking for direct-mutation or unsupported action types.
   - Add tests for allowed proposal actions, denied direct actions, and error/fallback behavior.

5. **Test Slice E - Cross-Facade Regression Pack**
   - Add orchestration-level tests covering preprocessor -> planner -> response mode -> resolver sequencing.
   - Verify no regressions in proposal validation, consent, crisis boundary, and approval gate invariants.
   - Include invalid-policy and missing-config fallback scenarios.

6. **Test Slice F - Safety/Contract Hardening**
   - Add focused negative tests that assert no direct mutation actions escape resolver boundaries.
   - Add contract tests for typed preprocessor/planner outputs to catch schema drift early.
   - Keep tests isolated from frontend; backend pipeline only.

These slices are intentionally narrow and can be assigned independently to backend/test subagents while staying below the target context threshold per task.
