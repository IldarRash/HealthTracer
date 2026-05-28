# Repo-Backed AI Behavior Config (Files First)

## Problem

The chat/AI pipeline has already moved substantial logic into capability, planner, and context-policy infrastructure, but meaningful behavior is still hardcoded in backend services. This makes iteration slow, increases regression risk, and keeps policy decisions scattered across code paths instead of auditable, versioned configuration.

The team approved the direction to maximize abstraction: keep runtime code as a generic engine that enforces safety and domain invariants, and move remaining mutable behavior into repository-backed config files first.

## Goal

Deliver a files-first behavior system where remaining hardcoded chat/AI policy is migrated into versioned repo config, validated at load time, and consumed by generic orchestration engines. Database overlays are deferred until file-based policy is stable and audit/versioning requirements are defined.

## Architecture Decision

### Decision

Adopt **repo-backed config files as the source of behavior policy** for the remaining extraction targets in the chat/AI pipeline.

### Why now

- Keeps policy changes code-reviewable and versioned with product context.
- Enables deterministic fail-closed startup/runtime behavior.
- Reduces hardcoded branching in orchestrator/chat modules.
- Creates a stable substrate before introducing dynamic runtime policy.

### Deferred decision

Add **DB overlay policy** only in a later phase, and only with:
- explicit audit history,
- policy version pinning,
- rollback support,
- ownership/permission boundaries.

## In Scope

1. **Direct-path behavior extraction**
   - Regex/pattern matching rules.
   - Reply templates/content keys.
   - Refresh hints and UI metadata hints.

2. **Proposal revision behavior extraction**
   - Mapping rules from original proposal intent to revision route/capability.
   - Deterministic fallback rules when mapping is missing/invalid.

3. **Response mode policy extraction**
   - Default response mode per capability/path.
   - Escalation/override policy that remains deterministic and typed.

4. **Context budget policy extraction**
   - Budget profile definitions.
   - Deep-review triggers and bounded review routing.
   - Configurable context policy knobs that remain bounded by code-level hard limits.

5. **Provider prompt template extraction**
   - Capability-scoped system/developer prompt templates.
   - Structured placeholders and safe interpolation contracts.

6. **Attachment routing policy extraction**
   - Category priority and routing order.
   - Category-to-capability mapping and fallback behavior.

7. **Proposal explainer detection extraction**
   - Rule patterns and priority for explicit explainer turns.
   - Deterministic no-mutation response mode for explainer paths.

8. **Deterministic proposal trigger extraction (where practical)**
   - File-defined trigger rules for currently hardcoded deterministic proposal helpers.
   - Explicit scope limits where triggers must remain code-level for safety/domain correctness.

## Non-Goals

- No DB-backed runtime overrides in this phase.
- No removal of type/schema validation and fail-closed behavior.
- No direct LLM mutation of structured state.
- No bypass of existing proposal validation/approval flow.
- No diagnosis/treatment workflows or medical-certainty behavior.
- No broad rewrite of domain services or proposal apply services.

## Safety Invariants (Must Stay True)

- Structured state remains authoritative; chat/AI remains an interaction layer.
- AI may propose/explain/summarize but must not directly mutate domain entities.
- All state-changing outputs remain proposal-based and user-approved before apply.
- No raw document exposure in prompts/responses beyond existing bounded policies.
- Attachment consent boundaries and ownership checks remain enforced.
- Tool execution remains allowlisted, bounded, and validated.
- Crisis, consent, and medical-safety boundaries remain intact.

## What Must Remain In Code

These concerns are intentionally **not** moved to config:

- Typed schemas and config validation parsers.
- Fail-closed loader behavior and safe defaults.
- Tool allowlist enforcement and bounded loop execution.
- Proposal safety validation and domain validation pipelines.
- Permissions, ownership, and consent enforcement.
- No-raw-document exposure enforcement.
- No-direct-LLM-mutation guarantees.
- Executor guards and mutation gatekeeping in domain services.

## Acceptance Criteria

1. Remaining targeted hardcoded behavior is represented in repo-backed config files with typed schemas and version-controlled defaults.
2. Loader/registry resolves policy from files at startup (and approved refresh points), with deterministic fail-closed fallback on invalid/missing config.
3. Orchestration/chat code paths consume config via registry/facades rather than hardcoded constants/branches for extracted behavior.
4. Direct-path patterns, proposal revision mapping, response mode defaults, context budget/review triggers, prompt templates, attachment routing priority, explainer detection rules, and deterministic trigger rules are file-configurable where practical.
5. Safety invariants remain enforced in code and cannot be disabled by config.
6. Negative-path tests prove invalid config cannot silently degrade into unsafe behavior.
7. Developer docs clearly define config ownership, schema evolution rules, and rollout/rollback expectations.
8. Runtime verification confirms the targeted chat flows behave identically or better under file-backed policy.
9. `.cursor/plans/capability_chat_gap_140b3bfe.plan.md` is not edited.

## Risks, Assumptions, Open Questions

- **Risk:** schema drift across config files may create inconsistent behavior if ownership boundaries are unclear.
- **Risk:** over-abstraction can hide intent if config contracts become too broad or under-documented.
- **Risk:** prompt-template extraction can increase fragility if placeholders are not strongly validated.
- **Assumption:** current registry/facade structure is mature enough to absorb file-based policies without architecture churn.
- **Open question:** should config support environment-scoped variants before DB overlays, or remain single-source per deploy artifact initially?
- **Open question:** which deterministic trigger rules are practical to externalize now vs. intentionally code-owned for safety semantics?

## Rollout Plan

1. **Contracts and layout first**
   - Finalize typed contracts and repo file layout.
   - Define ownership, defaults, and schema versioning policy.

2. **Migrate read-mostly policies**
   - Extract direct-path, response-mode, explainer detection, and attachment routing behavior.
   - Keep deterministic parity tests against current behavior.

3. **Migrate planner/revision/context policies**
   - Extract proposal revision mapping and context budget/review triggers.
   - Enforce code-level clamps and safe defaults.

4. **Migrate prompt templates**
   - Extract provider templates with strict placeholder validation.
   - Add malformed-template fail-safe behavior.

5. **Stabilize, verify, and document**
   - Run focused test matrix, regression checks, and runtime flow verification.
   - Publish ops/developer guidance for policy edits and rollback.

6. **Prepare DB overlay decision gate (later phase)**
   - Define audit/versioning model and promotion workflow.
   - Proceed only after files-first policy is stable in production-like validation.

## Recommended Implementation Slices (Subagent-Sized, <30% Context Each)

1. **Contracts + Package Layout Slice**
   - Define/extend shared policy schemas and parser contracts.
   - Establish config directory/package layout and ownership boundaries.
   - Add schema validation tests and migration notes.

2. **Config File Migration Slice**
   - Create initial policy files for all extraction targets with parity defaults.
   - Encode deterministic fallback values and comments for operators.

3. **Loader + Registry Integration Slice**
   - Implement fail-closed config loading and typed registry access.
   - Wire facades/services to consume registry values instead of literals.

4. **Direct-Path Extraction Slice**
   - Move direct-path regex/patterns/replies/refresh hints into config.
   - Preserve deterministic ordering and conflict resolution semantics.

5. **Planner + Revision + Context-Budget Extraction Slice**
   - Externalize proposal revision mapping, response mode defaults, and context budget/review trigger profiles.
   - Keep hard clamps and mutation guards in code.

6. **Prompt Template Extraction Slice**
   - Move provider prompt templates and capability prompt metadata into files.
   - Add placeholder validation and safe interpolation tests.

7. **Attachment + Explainer + Deterministic Trigger Extraction Slice**
   - Externalize attachment category priority/routing, proposal explainer detection rules, and practical deterministic proposal triggers.
   - Keep non-extractable safety-sensitive decision points code-owned.

8. **Tests, Docs, and Runtime Verification Slice**
   - Add regression/negative tests for invalid config and safety invariants.
   - Update architecture/product docs and run local flow verification.
   - Record rollback procedure and operational guardrails.

## Recommended Subagents (Execution Order)

1. **Backend Implementer** - Contracts/package layout and loader/registry wiring.
2. **Backend Implementer** - Direct-path and planner/revision/context-budget extraction.
3. **Backend Implementer** - Prompt template plus attachment/explainer/trigger extraction.
4. **Test Writer** - Focused schema, negative-path, and regression coverage.
5. **Implementation Reviewer** - Safety/domain invariant and architecture-fit review.
6. **App Runner** - Runtime verification of target chat flows and policy refresh behavior.
7. **Agents Memory Updater** - Capture durable workflow/architecture learnings after validation.

This sequence keeps each task narrow, preserves safety-first ownership in code, and supports incremental verification before any future DB overlay phase.

## Test Matrix

Focused regression and negative-path coverage for repo-backed behavior config. Run narrow validation with:

- `pnpm --dir packages/types test`
- `pnpm --dir packages/ai-behavior test`
- `pnpm --dir apps/api test -- src/modules/ai/ai-behavior-config.service.spec.ts src/modules/ai/direct-chat-path-matcher.service.spec.ts src/modules/ai/proposal-explainer-matcher.service.spec.ts src/modules/ai/system-planner.service.spec.ts src/modules/coaching-context/context-budget-policy.service.spec.ts`

| Area | Test file(s) | Behavior covered |
| --- | --- | --- |
| Schema + defaults | `packages/types/src/ai-behavior-config.spec.ts` | Valid defaults, invalid shape rejection, full-default fallback on invalid file value, normalization, revision routing, attachment priority, deterministic triggers |
| Safety invariants | `packages/types/src/ai-behavior-safety-invariants.spec.ts` | Fail-closed load, absolute budget clamps, invalid regex/template fallback, direct-path and explainer guards, crisis/disabled trigger safety, invalid capability override skip |
| Direct-path matcher | `packages/types/src/direct-chat-path-matcher.spec.ts`, `apps/api/src/modules/ai/direct-chat-path-matcher.service.spec.ts` | Parity, config-only pattern changes, invalid regex fail-closed, attachment/disable guards, service reload |
| Proposal explainer | `packages/types/src/proposal-explainer-matcher.spec.ts`, `apps/api/src/modules/ai/proposal-explainer-matcher.service.spec.ts`, `apps/api/src/modules/chat/proposal-explainer.service.spec.ts` | Config-only detection, invalid regex fail-closed, bounded read-only context |
| Context budget | `packages/types/src/context-budget.spec.ts`, `apps/api/src/modules/coaching-context/context-budget-policy.service.spec.ts` | Profile parity, config-only deep-review triggers, code clamps, document/sensitive-field stripping, invalid trigger regex fail-hard at service init |
| Prompt templates | `packages/types/src/prompt-template-renderer.spec.ts`, `apps/api/src/modules/ai/ai-behavior-config.service.spec.ts` | Placeholder validation, config override, invalid-body fallback via compiled defaults |
| Loader | `packages/ai-behavior/src/loader.spec.ts` | Shipped file parity, missing file fallback, invalid schema fallback, malformed JSON fallback |
| Planner / orchestration | `apps/api/src/modules/ai/system-planner.service.spec.ts`, `apps/api/src/modules/ai/agent-orchestrator.service.spec.ts`, `apps/api/src/modules/chat/chat.service.spec.ts` | Config-driven revision routing, direct-path bypass without AI, explainer no-proposal mode, proposal validation at chat time, no raw document exposure, direct mutation guards |

### Safety invariant expectations (must stay code-enforced)

| Invariant | Primary proof |
| --- | --- |
| No direct LLM mutation | `ActionResolverService` filters direct actions; direct paths call guarded domain services in `chat.service.spec.ts` |
| Proposal validation required | `chat.service.spec.ts` persists invalid proposals with `validationStatus: "invalid"` |
| No raw document exposure | `context-budget-policy.service.spec.ts` strips documents/sensitive fields; orchestrator minimization tests |
| Direct actions guarded | Direct-path tests block attachments/revisions/crisis; ambiguous workout done returns clarification without mutation |
| Invalid config fail-closed | Loader + `resolveLoadedAiBehaviorConfig` return built-in defaults; invalid regex/templates compile to no-match or default bodies |

### Known gap (documented, not silently safe)

- Invalid `contextBudgets.triggers.*MessagePattern` regex strings pass schema validation but fail at `ContextBudgetPolicyService` construction. Treat trigger-pattern edits as startup-critical until compile-time validation is added.
