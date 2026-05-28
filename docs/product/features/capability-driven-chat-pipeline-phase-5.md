# Capability-Driven Chat Pipeline (Phase 5)

## Problem

Phases 1-4 established capability config, planner/resolver facades, direct deterministic paths, and proposal explanation metadata, but the coach path still lacks strict context-budget enforcement and a safe compression/expansion protocol for large or multi-domain turns. Without bounded context policy, monthly review style prompts can over-fetch context, increase cost/latency, and weaken predictable safety behavior.

## Goal

Deliver a safe, implementable Phase 5 MVP for bounded context handling:

- enforce context budget policy before context loading,
- add a typed context compression contract and provider hook/stub,
- add bounded expansion request contracts,
- add planner flags for monthly and multi-domain review flows.

This phase is infrastructure and policy first, not a full analytics engine.

## Safe MVP Scope (Phase 5)

### In Scope

1. **Context budget policy (first-class)**
   - Define typed budget policy profiles (for example, `default`, `deepReview`) with hard limits:
     - `maxSlices`,
     - `maxDepth`,
     - `maxRawItems`,
     - `maxLookbackDays`,
     - `allowDocuments` (default `false`).
   - Planner must produce a budget before context engine loads raw context.
   - Context engine must enforce limits and return deterministic truncation metadata.

2. **Typed compression contract**
   - Add shared typed schema for compression output (structured summary, evidence refs, domain buckets, confidence/quality markers).
   - Compression result is typed data, not free-form unvalidated text.
   - Include bounded input contract (what raw slices are allowed into compression).

3. **Compression provider hook + stub implementation**
   - Add backend compression provider interface used by orchestration.
   - Wire a deterministic stub/dev provider for MVP and tests.
   - Keep real provider integration optional/feature-flagged for this phase.

4. **Bounded context expansion request contract**
   - Define typed expansion request/response contracts for "need more context" flows.
   - Enforce expansion limits (`maxExpansionRounds`, `maxSlicesPerRound`) in orchestration/policy.
   - Expansion requests outside bounds must fail safe and continue with existing context.

5. **Planner review flags (monthly/multi-domain)**
   - Planner should emit explicit flags such as:
     - `isMonthlyReview`,
     - `isMultiDomainReview`,
     - `requiresCompression`.
   - For flagged large/multi-domain review turns, orchestration uses compression path when budget rules require it.

6. **Backend validation/tests**
   - Add focused tests for budget enforcement, compression typing, expansion bounds, and monthly/multi-domain gating behavior.
   - Confirm no change to proposal approval, validation, and structured-state authority boundaries.

### Out of Scope for This Phase

- Full trend analytics engine or new long-horizon data warehouse logic when current services do not provide required data.
- UI-heavy monthly dashboard or new review-specific frontend product surface.
- Broad context-engine rewrite beyond budget/compression/expansion contracts.
- Unbounded autonomous tool orchestration.

## Explicit Non-Goals

- No raw document expansion by default.
- No medical certainty language, diagnosis, or treatment workflows.
- No unbounded tool loop or unbounded context expansion loop.
- No direct mutation of structured state from compression/expansion outputs.
- No UI-heavy monthly dashboard build in Phase 5.

## Acceptance Criteria

1. Planner emits a context budget per eligible turn, and backend enforces `maxSlices`, `maxDepth`, `maxRawItems`, and `maxLookbackDays`.
2. Compression service returns a validated typed summary contract; invalid compression output fails safe.
3. Expansion request handling enforces `maxExpansionRounds` and `maxSlicesPerRound`; out-of-policy requests are rejected or no-op safely.
4. Large monthly and multi-domain review paths use compressed context whenever policy marks compression required.
5. Documents are not expanded by default unless explicitly allowed by policy.
6. Existing safety boundaries remain: no direct mutation, no bypass of proposal validation/approval, no medical certainty behavior.
7. Automated tests cover boundary enforcement and negative cases for budget overflow, malformed compression output, and expansion overrun.
8. `.cursor/plans/capability_chat_gap_140b3bfe.plan.md` remains unchanged.

## Risks, Assumptions, Open Questions

- **Risk:** compression quality may vary; typed schema reduces drift but does not guarantee high insight quality.
- **Risk:** strict budgets may omit relevant historical context for edge cases if defaults are too tight.
- **Assumption:** current domain context services can provide enough slices for useful monthly/multi-domain summaries without building new analytics backends.
- **Open question:** should `deepReview` budget be capability-specific or globally policy-driven in MVP (recommend global first, capability overrides later).

## Rollout Boundary

Phase 5 is **backend infrastructure only** for this slice:

- **Shipped:** typed budget/compression/expansion contracts (`packages/types`), budget policy service, context engine enforcement hooks, compression provider stub, expansion policy service, planner review flags, orchestrator compression wiring.
- **Not shipped:** real LLM compression provider, UI review surfaces, analytics warehouse, autonomous expansion loops, document expansion by default.
- **Unchanged invariants:** proposal validation/approval, structured-state authority, medical safety boundaries, attachment/direct-path behavior from Phases 1–4.

Phase 6+ may add real compression providers, capability-specific budget overrides, and richer review UX. Phase 5 code paths are safe to deploy behind existing coach orchestration with stub compression.

## Phase 5 Test Matrix

| Risk / behavior | Primary test location | Status |
|---|---|---|
| Budget profile presets (`default`, `deep_review`) | `packages/types/src/context-budget.spec.ts` | Covered |
| Budget override clamp to absolute limits | `packages/types/src/context-budget.spec.ts` | Covered |
| Depth clamp to policy max | `packages/types/src/context-budget.spec.ts` | Covered |
| Slice count / depth / lookback / document denial in slice plan | `apps/api/.../context-budget-policy.service.spec.ts` | Covered |
| `maxRawItems` truncation on built slices | `apps/api/.../context-budget-policy.service.spec.ts` | Covered |
| Document fields stripped from built slices by default | `apps/api/.../context-budget-policy.service.spec.ts`, `coaching-context.service.spec.ts` | Covered |
| Typed compression summary validation | `packages/types/src/context-budget.spec.ts` | Covered |
| Malformed compression output rejected | `packages/types/src/context-budget.spec.ts`, `context-compression.service.spec.ts` | Covered |
| No raw document content in compression output | `packages/types/src/context-budget.spec.ts`, `context-compression.service.spec.ts` | Covered |
| Compression skipped when not required | `apps/api/.../context-compression.service.spec.ts` | Covered |
| Primary provider throw / malformed → stub fallback | `apps/api/.../context-compression.service.spec.ts` | Covered |
| Both providers fail → null summary, safe notes | `apps/api/.../context-compression.service.spec.ts` | Covered |
| Expansion round overrun denied | `packages/types/src/context-budget.spec.ts`, `context-expansion-policy.service.spec.ts` | Covered |
| Slice-per-round overrun denied | `packages/types/src/context-budget.spec.ts`, `context-expansion-policy.service.spec.ts` | Covered |
| Document expansion denied when `allowDocuments=false` | `packages/types/src/context-budget.spec.ts`, `context-expansion-policy.service.spec.ts` | Covered |
| Expansion disabled when `maxExpansionRounds=0` | `apps/api/.../context-expansion-policy.service.spec.ts` | Covered |
| Planner emits default budget for routine turns | `apps/api/.../system-planner.service.spec.ts` | Covered |
| Planner emits deep review + flags for monthly / multi-domain | `apps/api/.../system-planner.service.spec.ts`, `context-budget-policy.service.spec.ts` | Covered |
| Context engine enforces budget when building agent context | `apps/api/.../coaching-context.service.spec.ts` | Covered |
| Orchestrator attaches typed summary for review turns | `apps/api/.../agent-orchestrator.service.spec.ts` | Covered |
| Orchestrator skips compression for routine turns | `apps/api/.../agent-orchestrator.service.spec.ts` | Covered |
| Orchestrator uses stub fallback when primary compression fails | `apps/api/.../agent-orchestrator.service.spec.ts` | Covered |
| Proposal validation / approval unchanged | Existing orchestrator proposal-filter tests | Covered (regression) |

**Manual / future coverage:** real OpenAI compression provider integration, end-to-end monthly review UX, capability-specific budget overrides.

## Recommended Implementation Slices (Subagent-Sized, <30% Context Each)

1. **Types Slice - Budget + Compression + Expansion Contracts**
   - Add/extend shared types and schemas for budget policy, compression output, and expansion request/response.
   - Include strict parse/validation tests.

2. **Planner Slice - Budget Builder + Review Flags**
   - Update system planner output with budget object and monthly/multi-domain/compression flags.
   - Add fallback/default policy behavior tests.

3. **Context Engine Slice - Hard Budget Enforcement**
   - Enforce max slices/depth/raw items/lookback before data is returned.
   - Emit truncation/limit metadata for downstream services.

4. **Compression Service Slice - Provider Hook + Stub**
   - Add compression provider interface and deterministic stub provider.
   - Wire orchestration to call compression only when planner/policy requires it.

5. **Expansion Policy Slice - Bounded Expansion Rounds**
   - Implement typed expansion request handling with round/slice limits.
   - Ensure safe continuation when expansion is denied.

6. **Review Flow Slice - Monthly/Multi-Domain Gating**
   - Route flagged large review turns through compressed-context path.
   - Preserve existing proposal/safety/approval invariants.

7. **Regression Test Slice - Boundary and Safety Coverage**
   - Add focused API/service tests for all limits and fail-safe behavior.
   - Add negative tests proving no direct mutation or unbounded looping.

These slices are intentionally narrow and independently assignable so each task should stay under the 30% context target.
