# AI Proposal Flow Implementation Brief

## Problem statement

The current chat proposal system already enforces typed proposals and user approval, but intent routing remains rule-only and treats unclear messages as generic chat. This creates a gap for ambiguous user requests where the system should select context more intelligently before the final coaching response. The product also needs explicit Apply/Modify/Reject UX boundaries in inline chat cards so users always see that structured state changes happen only after confirmation.

## MVP scope

- Add uncertain-intent fallback routing:
  - Keep deterministic rule routing for clear intents.
  - Add route confidence/uncertainty handling.
  - When uncertain, call an internal LLM router that returns typed routing output (intent, confidence, routing method, required context slice plan, safety flags, expected response mode).
- Add typed context slice selection from router output:
  - Build context from a bounded router plan (max 3 slices, medium-by-default depth, explicit time ranges).
  - Keep documents and raw data disabled unless explicitly required.
  - Return explicit "missing context" notes instead of silently hallucinating.
- Keep final user-facing response in the final coach LLM:
  - Router call is non-user-facing classification/planning only.
  - Final LLM returns typed reply + optional proposal drafts.
- Preserve and tighten backend proposal lifecycle:
  - Treat final LLM proposals as drafts until backend validation passes.
  - Persist valid drafts as pending proposals linked to assistant message.
  - Keep pending/rejected/superseded proposals non-mutating.
  - Keep accepted proposals revision-safe for workout/nutrition/habit updates.
- Align inline chat proposal UX boundaries:
  - Inline proposal cards stay primary MVP surface.
  - Action boundaries become `Apply`, `Modify`, `Reject`.
  - `Apply` remains disabled for invalid proposals.
  - `Modify` requests a revised proposal and must not mutate state.

Current baseline already present and must be preserved:

- Typed context slices and conservative rule router.
- Chat persistence of assistant replies and pending proposals.
- Strong backend proposal validation and re-validation on apply.
- Revision-safe proposal application for workout, nutrition, and habits.
- Inline proposal rendering in chat.

## Out of scope

- Autonomous AI state mutations without explicit user action.
- Diagnosis/treatment workflows, medication guidance, or medical certainty language.
- Full autonomous context expansion loops beyond bounded MVP behavior.
- Broad redesign of chat/transcript layouts beyond proposal card action and state boundaries.
- Mobile parity work (web/API flow only for this feature).
- Advanced proposal expiration/undo/history UI beyond existing statuses needed for MVP flow.

## User stories

- As a user with an ambiguous request, I get a context-aware coaching answer instead of a shallow generic fallback.
- As a user receiving a suggested plan change, I can see a clear inline proposal card and decide before any state change.
- As a user, when I click `Apply`, the system safely validates and applies only that proposal.
- As a user, when I click `Modify`, I can request adjustments and receive a revised pending proposal.
- As a user, when I click `Reject`, my plan remains unchanged.
- As a user, I can trust that accepted workout/nutrition/habit changes create revisions rather than overwriting active plans.

## Acceptance criteria

1. **Routing behavior**
   - Clear high-confidence intents continue through rule routing without calling LLM router.
   - Ambiguous/low-confidence messages call LLM router exactly once per turn.
   - LLM router output is validated against a typed schema and contains no user-facing advice text.

2. **Context selection**
   - Context slices are selected from typed router plan output, not ad-hoc prompt assembly.
   - Context selection is bounded (`maxContextSlices <= 3`) and defaults to safe depth/time-range values.
   - Missing required context is surfaced explicitly to the final LLM/orchestrator metadata.

3. **Final response/proposal output**
   - Final coach LLM remains the only call that writes user-facing coaching text.
   - Final output is parsed to typed structured output (`reply` + typed proposal drafts).

4. **Backend proposal controls**
   - Proposal drafts are validated before persistence and stored as pending when valid.
   - Invalid proposals are visible as invalid and cannot be applied.
   - Pending/rejected/superseded proposals do not mutate structured state.
   - Accepted proposal application re-validates domain rules and permissions.
   - Accepted workout/nutrition/habit proposals create new revisions (no in-place overwrite).

5. **Inline proposal card UX**
   - Chat renders inline proposal cards linked to assistant messages.
   - Pending cards expose `Apply`, `Modify`, `Reject`.
   - `Apply` is disabled with clear reason for invalid proposals.
   - `Modify` creates a revised proposal path and does not apply state changes.
   - `Reject` marks proposal rejected and preserves current structured state.

6. **Safety and governance**
   - User approval remains required before any structured state change.
   - Health-context routing and copy retain non-diagnostic/non-treatment constraints.

## Safety/privacy requirements

- Do not diagnose, prescribe, or imply treatment outcomes.
- Keep structured state authoritative; chat remains interaction and explanation layer.
- Never apply plan/state changes automatically from model output.
- Require explicit user approval before any structured state mutation.
- Keep document and raw-data context least-privilege and purpose-limited.
- Do not expose raw health documents or sensitive wellbeing notes by default.
- Preserve auditable proposal lifecycle states and provenance.

## Implementation risks

- LLM router misclassification could select wrong context and degrade answer quality.
- Router schema drift could break orchestration/context builder compatibility.
- Two-call flow (router + final LLM) adds latency/cost and needs careful thresholds.
- `Modify` UX/API boundary can create race conditions with pending/superseded proposals.
- Existing action labels (`Accept/Decline`) and decision schema (`accept/reject`) require coordinated backend/frontend contract changes.
- Ambiguous multilingual phrasing may produce unstable router confidence without strong tests.

## Suggested role breakdown

- **Backend Implementer**
  - Add uncertainty-aware routing and LLM-router fallback in AI orchestrator/provider.
  - Add typed LLM-router contracts and bounded router context plan handling.
  - Keep final LLM output parsing and proposal draft flow intact.
  - Extend proposal decision/lifecycle boundaries for `Modify` path without direct state mutation.
  - Preserve and verify revision-safe apply behavior.

- **Frontend Implementer**
  - Update inline proposal card actions to `Apply/Modify/Reject`.
  - Wire `Modify` action to revised-proposal flow.
  - Keep invalid-apply disabled behavior and clear validation messaging.
  - Keep inline-card-in-chat architecture as primary proposal UX.

- **Test Writer**
  - Add routing tests for clear vs uncertain intent and LLM-router fallback.
  - Add contract tests for typed router output and context plan validation.
  - Add integration tests for pending/apply/modify/reject lifecycle.
  - Add regression tests for revision-safe writes and non-mutating pending/rejected states.

- **Implementation Reviewer**
  - Verify architecture fit with chat-as-layer and structured-state-authoritative invariants.
  - Verify safety/privacy boundaries and proposal-approval guarantees.
  - Verify tests cover failure paths, concurrency edges, and contract drift.

- **App Runner**
  - Run local stack and verify end-to-end chat flow:
    - clear intent path,
    - uncertain intent fallback path,
    - inline proposal card actions,
    - revision creation after apply.
  - Report URLs, runtime status, blockers, and next owner.

Roles to skip for this scope (unless UI scope expands during implementation): Visual Designer, Design System Agent, UI Polish Implementer.
