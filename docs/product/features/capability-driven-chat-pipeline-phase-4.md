# Capability-Driven Chat Pipeline (Phase 4)

## Problem

Phases 1-3 moved core routing and direct-path safety into capability-aware infrastructure, but several chat/orchestrator branches still encode domain behavior directly (capability selection shape, widget/action metadata ownership, and proposal explanation handling). This slows safe extension and keeps policy split between code and config.

## Goal

Deliver a narrow Phase 4 that:

- adds config-driven **multi-capability composition metadata**,
- introduces a small **proposal explainer capability** ("why this proposal?"),
- emits **widget/action metadata from capability config**,
- removes remaining practical domain-specific chat/orchestrator branches where equivalent capability/policy config can safely own behavior.

The phase remains safety-first: structured state authority, proposal validation, consent boundaries, and no direct plan mutation from AI are unchanged.

## Safe MVP Scope (Phase 4)

### In Scope

1. **Capability config extensions (composition + metadata)**
   - Capability schema supports:
     - composition hints (selected + supporting capabilities),
     - widget metadata descriptors,
     - action metadata descriptors tied to allowed proposal/action outputs.
   - Planner can return selected capabilities as a list, even if response generation still uses a single primary capability for this phase.

2. **Planner and orchestration integration**
   - Planner exposes:
     - `primaryCapabilityId`,
     - `selectedCapabilities[]`,
     - merged/ordered metadata needed by resolver/response formatting.
   - Existing safety fallbacks stay deterministic when config is invalid/missing.

3. **Proposal explainer capability (small vertical flow)**
   - Detect explicit explanation requests for an existing proposal (for example: "why this proposal?").
   - Resolve latest relevant stored proposal and bounded evidence/context.
   - Return explanation-oriented response grounded in proposal rationale/evidence, without applying or mutating any plan/state.

4. **Config-driven widget/action metadata emission**
   - Response contracts can include widget/action metadata sourced from capability config for the selected capability set.
   - Keep frontend impact minimal: consume metadata for current chat rendering path only (no generic runtime widget platform).

5. **Regression and safety tests**
   - Cover composition metadata parsing and planner exposure.
   - Cover proposal explainer retrieval and response path.
   - Prove no direct plan mutation occurs in explainer/composition paths.

### Out of Scope for This Phase

- Context compression or context-budget expansion infrastructure.
- Broad frontend widget framework/runtime engine.
- Unrestricted multi-agent autonomy or open-ended tool orchestration.
- Medical explanation certainty, diagnosis, or treatment-style output.
- Any direct plan mutation path from explainer/composition logic.

## Explicit Non-Goals

- No context compression implementation.
- No broad frontend widget framework.
- No unrestricted multi-agent autonomy.
- No medical explanation certainty language.
- No direct plan mutation.

## Acceptance Criteria

1. Capability config schema supports:
   - multi-capability composition metadata,
   - widget metadata,
   - action metadata,
   with strict validation and safe fallback on invalid config.
2. Planner exposes selected capabilities for a turn, even when response execution remains single-primary-capability in Phase 4.
3. Proposal explainer capability answers explicit "why this proposal?" turns using stored proposal plus bounded evidence/context references.
4. Explainer responses remain coaching/supportive and avoid medical certainty; they do not diagnose or prescribe treatment.
5. Widget/action metadata returned in response payload is sourced from capability config (not new hardcoded domain branches).
6. Tests verify explainer/composition flows do not directly mutate workout/nutrition/today/goal/profile plan state.
7. Existing crisis, consent, proposal validation, and approval-before-apply boundaries remain intact.
8. `.cursor/plans/capability_chat_gap_140b3bfe.plan.md` is not edited.

## Risks, Assumptions, Open Questions

- **Risk:** composition metadata can become ambiguous if precedence/merge order is not deterministic.
- **Risk:** proposal explanation quality may degrade if stored evidence pointers are sparse.
- **Risk:** moving metadata into config without strong validation can create runtime drift.
- **Assumption:** proposal records already store enough rationale/evidence references for bounded explanation.
- **Open question:** should multi-capability composition in this phase be additive-only metadata, or allow limited prompt merge rules beyond primary capability instructions?

## Recommended Implementation Slices (Subagent-Sized, <30% Context Each)

1. **Types + Registry Contract Slice**
   - Extend capability schema for composition/widget/action metadata.
   - Add validation/parse tests and safe defaults.

2. **Planner Composition Exposure Slice**
   - Update planner output contract to include `selectedCapabilities[]` + `primaryCapabilityId`.
   - Keep execution policy primary-capability-first for this phase.

3. **Orchestrator Metadata Wiring Slice**
   - Thread config-sourced widget/action metadata through orchestration/result contracts.
   - Remove equivalent practical hardcoded branches where policy parity is preserved.

4. **Proposal Explainer Capability Slice**
   - Add explicit explainer intent/capability mapping.
   - Resolve proposal + evidence/context references and generate explanation response (template/LLM as currently allowed).
   - No mutation path.

5. **Backend Safety + Regression Test Slice**
   - Add tests for schema validation, planner composition exposure, metadata propagation, and explainer behavior.
   - Add negative tests proving no plan mutation from explainer/composition execution.

6. **Frontend Minimal Consumption Slice**
   - Use response metadata in current chat rendering path for proposal/explainer-related UI hints only.
   - Avoid introducing generic widget runtime abstractions.

These slices are intentionally narrow and independently assignable to keep each subagent task comfortably below the 30% context target.

## Phase 4 test matrix

| Risk / acceptance area | Primary tests | Status |
| --- | --- | --- |
| Composition/widget/action schema validation and defaults | `packages/types/src/capability-config.spec.ts` | Covered |
| Invalid composition/metadata descriptor rejection | `packages/types/src/capability-config.spec.ts` | Covered |
| Selected capability resolution and presentation merge | `packages/types/src/capability-config.spec.ts`, `packages/types/src/agent-context.spec.ts` | Covered |
| Proposal explainer detection and bounded context | `packages/types/src/proposal-explainer.spec.ts` | Covered |
| Agent turn metadata contracts (presentation fields) | `packages/types/src/agent-context.spec.ts` | Covered |
| Registry accessors and unknown-id fallbacks | `apps/api/src/modules/ai/capability-registry.service.spec.ts` | Covered |
| Planner exposes primary/selected capabilities and presentation metadata | `apps/api/src/modules/ai/system-planner.service.spec.ts` | Covered |
| Proposal explainer rule routing (no LLM router) | `apps/api/src/modules/ai/system-planner.service.spec.ts` | Covered |
| Orchestrator metadata propagation | `apps/api/src/modules/ai/agent-orchestrator.service.spec.ts` | Covered |
| Orchestrator strips proposals on explainer turns | `apps/api/src/modules/ai/agent-orchestrator.service.spec.ts`, `apps/api/src/modules/ai/action-resolver.service.spec.ts` | Covered |
| Proposal-only action resolver allowlist filtering | `apps/api/src/modules/ai/action-resolver.service.spec.ts` | Covered |
| Pre-AI explainer resolution (no proposal / with proposal) | `apps/api/src/modules/chat/proposal-explainer.service.spec.ts` | Covered |
| Chat path: no AI when no stored proposal; no proposal persistence | `apps/api/src/modules/chat/chat.service.spec.ts` (`proposal explainer turns`) | Covered |
| Explainer excluded from text router catalog | `packages/types/src/intent-catalog.spec.ts`, `capability-config.spec.ts` | Covered |

### Validation commands (narrow)

```bash
pnpm --filter @health/types exec vitest run src/capability-config.spec.ts src/proposal-explainer.spec.ts src/agent-context.spec.ts
pnpm --filter @health/api exec vitest run src/modules/ai/capability-registry.service.spec.ts src/modules/ai/system-planner.service.spec.ts src/modules/ai/action-resolver.service.spec.ts src/modules/ai/agent-orchestrator.service.spec.ts src/modules/chat/proposal-explainer.service.spec.ts
```

### Residual gaps (manual / future)

- End-to-end browser verification of widget/action metadata consumption in chat UI (Phase 4 frontend slice).
- Live LLM proposal-explainer copy quality and medical-safety wording under real provider output.

## Frontend Phase 4 Assessment

Phase 4 backend work adds capability composition and widget/action presentation metadata to **internal** agent turn metadata and introduces a read-only proposal explainer path. The external web contract is unchanged.

| Surface | Phase 4 change | Web impact |
| --- | --- | --- |
| `ChatTurnResponse` (`packages/types`) | Unchanged shape: `thread`, `userMessage`, `assistantMessage`, `proposals`, optional `attachmentOutcomes` | No API client or schema updates |
| Capability presentation metadata | Emitted on `assistantMessage.metadata.agent.capabilityPresentation` for agent turns | Not consumed; no widget/action renderer added |
| Proposal explainer | Assistant reply text in `assistantMessage.content`; optional `metadata.proposalExplainer` status; explainer turns return `proposals: []` | Renders as a normal coach bubble via existing chat transcript path |
| Generic widget framework | Explicit non-goal | Not implemented |

**Conclusion:** Phase 4 frontend consumption is a **no-op** for production UI. Proposal explainer replies already render correctly because `chat-workspace` displays assistant `content` unless crisis, weekly-review, or empty-content direct-path metadata applies — none of which apply to explainer turns.

### Validation commands

```bash
pnpm --dir apps/web test chat-proposal-explainer-render chat-ui-state chat-direct-path-ui-state
pnpm --dir apps/web typecheck
```
