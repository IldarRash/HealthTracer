# Capability-Driven Chat Pipeline (Phase 1)

## Problem

Current chat/AI orchestration is intent-catalog driven but still relies on hardcoded domain behavior spread across backend services, especially in `agent-orchestrator`, `chat`, and coaching-context assembly. This makes behavior harder to evolve safely, increases migration cost for new capabilities, and couples domain policy to implementation details instead of explicit configuration.

## Goal

Move chat/AI behavior toward a capability-driven, policy-configured pipeline where domain behavior is defined in typed configuration and loaded by backend infrastructure, while preserving existing proposal validation, safety boundaries, consent rules, and structured-state authority.

Phase 1 is a compatibility phase: represent current behavior through capability-compatible config and facades, without attempting a full architecture rollout in one step.

## MVP Phase Decision / Rollout Boundary

Phase 1 now stops at the compatibility foundation needed to move policy out of hardcoded service branches and into typed capability configuration. It includes capability config/types in `packages/types`, the API registry loader and facade integration, catalog-compatible capability mapping, orchestrator policy reads through the registry, focused tests, and a frontend no-op assessment because the backend contract is unchanged.

The MVP transition phase is planner/resolver facade first. Standalone planner and action resolver services, direct actions or 0-LLM paths, generic frontend widgets, context compression, and full capability composition are deferred.

The next recommended phase is to introduce standalone planner/resolver facades and wire context strategy selection through capability policy, still without allowing direct mutation of structured state.

## In Scope (Phase 1)

- Define a typed capability schema and policy model that can represent current intent-catalog behavior.
- Add capability registry and loader infrastructure for backend runtime use.
- Represent current normal and attachment intent behavior through capability-compatible config (initially mirroring existing catalog behavior).
- Have orchestration read capability policy, tool allowlists, proposal allowlists, and routing metadata from the registry rather than equivalent hardcoded branches.
- Add tests showing effective routing/policy behavior is read from config and validated by schema.
- Confirm frontend remains a no-op for Phase 1 because no backend contract or generic widget surface changes are introduced.

## Explicit Non-Goals (This Iteration)

- No full direct-action rollout (direct actions remain bounded to existing explicit backend-owned paths).
- No standalone planner service or standalone action resolver service.
- No context compression implementation.
- No broad frontend widget rebuild unless backend contract changes require minimal UI wiring.
- No full capability composition or capability-pack runtime.
- No relaxation of proposal approval, validation, safety, or consent gates.

## Acceptance Criteria (Phase 1)

- A typed capability schema exists and can express prompt/policy/routing metadata needed to mirror current catalog behavior.
- A capability registry and loader are available in backend runtime and validate config on startup/load.
- Current intent-catalog behavior is represented via capability-compatible configuration with parity for:
  - normal text intent routing,
  - attachment-family routing,
  - allowed tools/proposals and safety boundaries.
- A planner/resolver facade is introduced where practical so orchestration logic reads policy/capability config instead of embedding equivalent domain rules directly in service methods.
- Automated tests prove key routing/policy decisions are sourced from config (not only hardcoded branches), including safe fallback on invalid config.
- Proposal validation, crisis/safety handling, and medical consent behavior remain enforced with no direct LLM domain mutation path.
- `.cursor/plans/capability_chat_gap_140b3bfe.plan.md` remains unchanged.

## Risks

- Dirty working tree can hide regressions or create merge confusion during incremental migration.
- Capability migration may accidentally bypass or weaken existing proposal validation, safety boundaries, or consent checks if facades are introduced incorrectly.
- Mixing config-driven selection with legacy branching can create split-brain behavior during transition.
- If capability config is incomplete or stale versus current catalog, fallback behavior could over-route to generic intent.
- Pressure to let LLM outputs act directly could violate structured-state authority; direct mutation must remain blocked.

## Suggested Implementation Slices (Subagent-Sized)

1. **Capability Contract Slice (Backend + Types)**
   - Define schema/types for capability config and policy fields.
   - Add strict validation and parse errors.
   - Keep scope limited to contracts and fixtures.

2. **Registry/Loader Slice (Backend Infrastructure)**
   - Implement capability registry + loader + caching/bootstrap wiring.
   - Support deterministic fallback behavior when config fails validation.
   - Avoid changing orchestration behavior in this slice.

3. **Catalog-Compatibility Config Slice (Behavior Mapping)**
   - Create capability-compatible config entries that mirror current catalog intents and attachment families.
   - Include allowlists for tools/proposals and safety policy references.
   - Add parity tests for mapped examples.

4. **Planner/Resolver Facade Slice (Orchestration Integration)**
   - Add facade interfaces/services for plan selection and action resolution.
   - Integrate facades into `agent-orchestrator` and `chat` paths where practical.
   - Preserve existing deterministic exceptions and safety short-circuits.

5. **Config-Driven Verification Slice (Tests)**
   - Add focused tests proving behavior is config-sourced for representative text and attachment turns.
   - Add regression tests for proposal validation, consent, and no-direct-mutation invariants.
   - Add invalid/missing-config fallback tests.

6. **Documentation And Rollout Guard Slice**
   - Update architecture references to explain Phase 1 compatibility mode and boundaries.
   - Add rollout notes/flags for safe incremental adoption.
   - Confirm no plan-file edits and document migration checkpoints.

Each slice is intentionally narrow and can be assigned independently so a single subagent task should remain well below 30% context, with clear handoffs between slices.

## Phase 1 Test Matrix

Phase 1 compatibility mode is covered by focused unit tests. The matrix below maps acceptance areas to test files and marks future-phase areas explicitly out of scope for this iteration.

| Area | Phase | Status | Primary tests |
| --- | --- | --- | --- |
| Capability schema validation and parse errors | 1 | Covered | `packages/types/src/capability-config.spec.ts` |
| Catalog-to-capability conversion parity | 1 | Covered | `packages/types/src/capability-config.spec.ts` |
| Router serialization parity (catalog vs capability) | 1 | Covered | `packages/types/src/capability-config.spec.ts`, `apps/api/src/modules/ai/capability-registry.service.spec.ts` |
| Normal-only router capability list | 1 | Covered | `packages/types/src/capability-config.spec.ts`, `apps/api/src/modules/ai/capability-registry.service.spec.ts` |
| Tool/proposal allowlists from config | 1 | Covered | `packages/types/src/capability-config.spec.ts` |
| Response metadata derived from catalog mapping | 1 | Covered | `packages/types/src/capability-config.spec.ts` |
| Registry load, coach metadata derivation | 1 | Covered | `apps/api/src/modules/ai/capability-registry.service.spec.ts` |
| Registry fallback to `general` for unknown ids | 1 | Covered | `apps/api/src/modules/ai/capability-registry.service.spec.ts` |
| Orchestrator passes registry router catalog to LLM router | 1 | Covered | `apps/api/src/modules/ai/agent-orchestrator.service.spec.ts` |
| Orchestrator resolves policy metadata via registry | 1 | Covered | `apps/api/src/modules/ai/agent-orchestrator.service.spec.ts` |
| Config-sourced tool allowlist enforcement in agent loop | 1 | Covered | `apps/api/src/modules/ai/agent-orchestrator.service.spec.ts` |
| Config-sourced proposal allowlist filtering | 1 | Covered | `apps/api/src/modules/ai/agent-orchestrator.service.spec.ts` |
| Attachment-family deterministic routing | 1 | Covered | `apps/api/src/modules/ai/agent-orchestrator.service.spec.ts` |
| LLM router invalid-output/provider-error fallback | 1 | Covered | `apps/api/src/modules/ai/agent-orchestrator.service.spec.ts` |
| Proposal revision and safety short-circuits preserved | 1 | Covered | `apps/api/src/modules/ai/agent-orchestrator.service.spec.ts` |
| System Planner facade (standalone service) | 2+ | Future | Not implemented in Phase 1; routing facades live in orchestrator + registry |
| Action Resolver facade (standalone service) | 2+ | Future | Not implemented in Phase 1 |
| 0-LLM direct read / direct action paths | 2+ | Future | Documented in architecture; no Phase 1 runtime or tests |
| Frontend capability widgets | 2+ | Future | Phase 1 backend contract unchanged; no widget tests |
| Context compression LLM path | 2+ | Future | Explicit non-goal for Phase 1 |

### Validation commands

```bash
pnpm --dir packages/types test capability-config
pnpm --dir apps/api test capability-registry agent-orchestrator
```
