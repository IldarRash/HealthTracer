# User Context Engine for AI Health Coach

## Purpose

This document describes the target architecture for taking a chat message through a real AI coaching agent, controlled backend tools, the User Context Engine, consent-gated document/RAG retrieval, and the existing typed proposal approval flow.

The expanded goal is no longer only "prepare context slices." The goal is to make the product architecturally ready for a real OpenAI-backed coaching agent so the remaining runtime requirement is configuring an OpenAI API key, not filling in missing orchestration, context, tool, safety, or proposal architecture.

The AI agent should be aware of the user's history, plans, goals, habits, progress, preferences, and health-related context without raw database access, uncontrolled chat memory, or prompt dumps of sensitive data. The system should retrieve the right context at the right time, validate every typed boundary, and keep structured state authoritative.

---

# Target State

A user sends a message in chat. The backend classifies the turn, retrieves minimal structured context and consent-gated RAG context, calls a real AI provider through an agent orchestrator, validates the output, stores the assistant response, and creates typed proposals when plan changes are needed.

After this feature is implemented:

- Chat uses the real agent orchestration path end-to-end in local/stub mode.
- The agent provider abstraction supports both deterministic stub/dev responses and a real OpenAI provider selected by configuration.
- OpenAI mode fails clearly when the API key is missing.
- Context slices, tool calls, RAG results, citations, safety metadata, and proposal candidates are typed and validated.
- Plan-changing AI outputs become typed proposals only. They do not directly mutate workouts, nutrition plans, goals, metrics, documents, or other domain entities.
- User-approved plan changes continue through backend validation and revision-safe writes.
- Health documents and wellbeing notes are not exposed by default; document/RAG context is consent-gated and summarized with provenance.

---

# Core Principle

The AI agent should not directly query many database tables, rely only on RAG, or treat chat as the source of truth.

Instead, the system should provide a dedicated layer:

```text
User Context Engine
```

This layer prepares task-specific context packets for the agent, enforces privacy boundaries, and keeps structured state as the canonical source for plans, goals, metrics, progress, memories, proposals, and approvals.

---

# High-Level Architecture

```text
User message
  ↓
Chat Service
  ↓
AI Service
  ↓
AI Agent Orchestrator
  ↓
Intent Router
  ↓
Agent Context Request
  ↓
User Context Engine
  ├── Profile Provider
  ├── Goals Provider
  ├── Plans Provider
  ├── Logs Provider
  ├── Metrics Provider
  ├── Memory Provider
  ├── Snapshot Provider
  └── Consent-Gated Documents/RAG Provider
  ↓
Typed Agent Context Packet
  ├── structured summaries
  ├── curated memories
  ├── safe document summaries/signals
  ├── source references/provenance
  └── safety constraints
  ↓
OpenAI or Stub Agent Provider
  ↓
Validated Agent Output
  ├── safe assistant reply
  ├── typed tool results
  ├── typed proposal candidates
  ├── citations/provenance
  └── safety metadata
  ↓
Chat Persistence + Proposal Approval Flow
```

---

# Architecture Flow

1. `ChatService` receives a user message and preserves existing safety short-circuits, including crisis support behavior.
2. `AiService` sends an agent request to the AI Agent Orchestrator.
3. The orchestrator classifies the message with a conservative intent router.
4. The router maps the intent to a context purpose, depth, time range, and document/RAG policy.
5. The User Context Engine builds a typed context packet from structured providers, curated memories, snapshots, and consent-gated document signals.
6. The agent provider receives a bounded prompt, typed context, available tool descriptions, and safety rules.
7. The provider returns a structured response envelope, not free-form domain writes.
8. The backend validates the response, tool results, citations, safety metadata, and proposal candidates with shared Zod contracts.
9. Normal assistant replies are stored as chat messages. Plan-changing outputs are persisted only as pending proposals.
10. Proposal approval applies changes through existing backend validators and revision-safe workout/nutrition flows.

---

# Scope

In scope:

- Shared agent, context, tool-call, citation, RAG provenance, safety, and proposal-output contracts.
- User Context Engine slice APIs and typed output packets.
- Context providers for profile, goals, active plans, logs, metrics, wellbeing/recovery summaries, memories, snapshots, and document signals.
- Consent-gated document/RAG retrieval for document-aware and health-context turns.
- Curated memory as structured state with provenance, staleness, and revocation handling.
- AI Agent Orchestrator with provider selection, intent routing, tool registry, and typed response validation.
- OpenAI provider support behind configuration, plus deterministic stub/dev provider support for tests and local verification.
- Chat integration through the orchestrator path.
- Proposal preservation: AI suggests changes, backend validates them, user approves them, and accepted changes are revision-safe.
- Focused tests for contracts, routing, context selection, consent gates, provider selection, safety behavior, and proposal flow.

Out of scope / deferrals:

- Autonomous domain mutations by the AI agent.
- Diagnosis, treatment, medication, or disease-management workflows.
- Raw document or raw wellbeing note exposure to prompts by default.
- LLM-assisted intent routing unless rule-based routing proves insufficient.
- Advanced vector ranking quality work beyond a safe MVP RAG path.
- Frontend redesign. Frontend work should stay limited to rendering citations, tool metadata, or proposal links if backend metadata requires it.
- Production OpenAI rollout secrets/configuration. The architecture should be ready, but the runtime key must be supplied separately.

---

# Acceptance Criteria

The feature is ready when:

- Chat turns run through the AI Agent Orchestrator in stub/dev mode.
- OpenAI provider mode exists, is configurable, and reports a clear missing-key error when selected without an API key.
- `getUserContextSlice` and higher-level agent context building return typed, validated packets for the MVP slice purposes.
- The agent receives minimal task-specific context, not broad raw database records.
- Structured DB state is used for plans, goals, metrics, progress, and proposal application; RAG is used only for documents and long unstructured context.
- Document/RAG context is consent-gated and returns safe summaries/signals/snippets with source references and provenance.
- Raw health documents, raw wellbeing notes, and unnecessary sensitive health data are excluded by default.
- Agent outputs are parsed into safe replies, typed tool results, safety metadata, and typed proposal candidates.
- Plan-changing outputs create pending proposals and require user approval before domain state changes.
- Accepted workout and nutrition changes remain revision-safe.
- Existing wellbeing crisis behavior and unsafe-output fallback behavior are preserved.
- Tests cover contracts, intent routing, provider selection/missing-key behavior, context depth, document consent gates, memory inclusion/exclusion, wellbeing data exclusion, tool validation, and proposal provenance.
- App Runner can verify the chat flow locally in stub mode and report that the only remaining runtime step for real model execution is setting the OpenAI API key.

---

# Main Idea

The agent should not ask for tiny isolated values like:

```text
getWeight()
getWorkoutPlan()
getMeals()
getSleep()
```

Instead, it should ask for a full context slice:

```text
getUserContextSlice("workout_adaptation")
getUserContextSlice("nutrition_adaptation")
getUserContextSlice("weekly_review")
getUserContextSlice("longevity_overview")
```

The backend decides:

- which tables to read
- which period to analyze
- what to aggregate
- what to summarize
- what to exclude
- what to include from memories
- whether documents/RAG are needed

---

# What Is a User Context Slice?

A user context slice is a prepared data packet for a specific AI task.

Example:

```json
{
  "slice_type": "workout_adaptation",
  "user_profile": {
    "age": 29,
    "height_cm": 178,
    "weight_kg": 80,
    "fitness_level": "intermediate"
  },
  "active_goals": [
    "fat_loss",
    "vertical_jump_improvement"
  ],
  "current_workout_plan": {
    "name": "4-week strength and jump program",
    "current_week": 2,
    "today_session": "lower body strength"
  },
  "recent_execution": {
    "last_7_days": {
      "completed_workouts": 3,
      "skipped_workouts": 1,
      "volleyball_sessions": 2,
      "average_sleep_hours": 6.4,
      "fatigue_trend": "increasing"
    }
  },
  "relevant_memories": [
    "User often feels tired after volleyball games.",
    "User prefers sessions under 45 minutes."
  ],
  "recommendation_constraints": [
    "Avoid diagnosis.",
    "Prefer safe progressive overload.",
    "Do not increase intensity when fatigue is high."
  ]
}
```

This gives the agent a real picture of the user instead of scattered raw data.

---

# Recommended Context Slice Tool

## Tool Name

```text
getUserContextSlice
```

## Input

```ts
type ContextSlicePurpose =
  | "general_chat"
  | "daily_checkin"
  | "workout_adaptation"
  | "nutrition_adaptation"
  | "weekly_review"
  | "longevity_overview"
  | "health_context";

type ContextDepth = "small" | "medium" | "large";

type GetUserContextSliceInput = {
  userId: string;
  purpose: ContextSlicePurpose;
  depth?: ContextDepth;
  timeRange?: "7d" | "14d" | "30d" | "90d" | "1y";
  includeRawData?: boolean;
  includeDocuments?: boolean;
};
```

---

# Context Depth

The system should not always return maximum context.

Use different depth levels.

## Small

Use for simple chat or quick answers.

Includes:

```text
profile summary
active goals
today plan
last 7 days summary
important memories
```

## Medium

Use for plan adaptation.

Includes:

```text
small context
current active plan
recent execution details
constraints
relevant memories
recent revisions
```

## Large

Use for deeper reviews.

Includes:

```text
medium context
detailed logs
longer time range
previous plan changes
document snippets if needed
```

---

# MVP Context Slices

## 1. general_chat

Purpose:

General assistant conversation.

Includes:

```text
user profile
active goals
active plans summary
recent memories
last important events
```

Use when:

```text
The user asks a general question or talks casually.
```

---

## 2. daily_checkin

Purpose:

Daily tracking and feedback.

Includes:

```text
today plan
yesterday completion
sleep
mood
energy
steps
open checklist items
```

Use when:

```text
The user checks in, reports how they feel, or asks what to do today.
```

---

## 3. workout_adaptation

Purpose:

Adjust workout recommendations.

Includes:

```text
current workout plan
today workout
last 7-14 days workout logs
fatigue
sleep
soreness
injuries or constraints
performance trend
relevant memories
```

Use when:

```text
The user asks whether to train, skip, reduce intensity, change exercises, or adapt a program.
```

---

## 4. nutrition_adaptation

Purpose:

Adjust nutrition recommendations.

Includes:

```text
nutrition plan
calorie target
macro targets
meal logs
adherence
weight trend
preferences
restrictions
relevant memories
```

Use when:

```text
The user asks what to eat, how to adjust calories, or how to improve adherence.
```

---

## 5. weekly_review

Purpose:

Generate weekly progress review.

Includes:

```text
completed workouts
skipped workouts
nutrition adherence
weight trend
sleep trend
habit completion
wins
problems
recommended changes
```

Use when:

```text
The user asks for a weekly summary or the system generates one automatically.
```

---

## 6. longevity_overview

Purpose:

Long-term health and wellbeing overview.

Includes:

```text
long-term goals
habit consistency
sleep patterns
activity level
weight trend
recovery trend
user-provided risk factors
document summaries later
```

Use when:

```text
The user asks about long-term health, longevity, energy, or lifestyle direction.
```

---

## 7. health_context

Purpose:

Use health-related context safely.

Includes:

```text
user-provided health constraints
uploaded document summaries
structured biomarkers later
health metrics
safety boundaries
```

Use when:

```text
The user explicitly asks to consider health documents, symptoms, metrics, or medical background.
```

Important:

The assistant must not diagnose, prescribe medication, or claim to treat diseases.

---

# Raw Data vs Aggregated Data vs Synthesized Insights

The Context Engine should prepare 3 levels of information.

## Level 1 — Raw Data

Examples:

```text
all workouts for last 7 days
all meal logs
all daily check-ins
all sleep records
```

Use rarely.

## Level 2 — Aggregated Data

Examples:

```text
completed_workouts: 3
skipped_workouts: 1
average_sleep: 6.4h
protein_adherence: 72%
weight_trend: decreasing
```

Use often.

## Level 3 — Synthesized Insights

Examples:

```text
User performs strength workouts consistently but often skips recovery sessions.
User fatigue increases after volleyball sessions.
Nutrition adherence is weaker on weekends.
```

This is the most useful level for the AI agent.

---

# Context Engine Module Structure

Recommended backend structure:

```text
apps/api/src/modules/context/
  context.module.ts
  context.controller.ts
  context.service.ts

  slices/
    general-chat.slice.ts
    daily-checkin.slice.ts
    workout-adaptation.slice.ts
    nutrition-adaptation.slice.ts
    weekly-review.slice.ts
    longevity-overview.slice.ts
    health-context.slice.ts

  providers/
    profile-context.provider.ts
    goals-context.provider.ts
    workout-context.provider.ts
    nutrition-context.provider.ts
    health-metrics-context.provider.ts
    memory-context.provider.ts
    snapshot-context.provider.ts
    documents-context.provider.ts
    risks-context.provider.ts

  summarizers/
    workout-summary.service.ts
    nutrition-summary.service.ts
    adherence-summary.service.ts
    health-trend-summary.service.ts
    longevity-summary.service.ts
```

---

# Context Providers

Each provider should be responsible for one category of user information.

## Profile Provider

Returns:

```text
age
sex if provided
height
weight
language
fitness level
available equipment
preferences
constraints
```

## Goals Provider

Returns:

```text
active goals
goal priorities
deadlines
progress
goal conflicts
```

## Workout Provider

Returns:

```text
active workout plan
today workout
recent workout logs
skipped sessions
exercise performance
plan revisions
```

## Nutrition Provider

Returns:

```text
active nutrition plan
calorie target
macro target
meal logs
adherence
preferences
restrictions
```

## Health Metrics Provider

Returns:

```text
sleep
steps
weight
heart rate later
recovery later
wearable data later
```

## Memory Provider

Returns:

```text
durable preferences
patterns
constraints
behavior insights
```

## Documents Provider

Returns:

```text
relevant health document summaries
RAG snippets later
structured extracted facts later
```

## Snapshot Provider

Returns:

```text
weekly summaries
monthly summaries
previous context snapshots
plan change snapshots
```

---

# Typed Context Packets

All context slices should be typed and validated.

Use Zod schemas.

Example:

```ts
const WorkoutAdaptationContextSchema = z.object({
  purpose: z.literal("workout_adaptation"),
  userProfile: UserProfileSummarySchema,
  activeGoals: z.array(GoalSummarySchema),
  currentPlan: WorkoutPlanSummarySchema.optional(),
  todayWorkout: WorkoutSessionSummarySchema.optional(),
  recentExecution: WorkoutExecutionSummarySchema,
  recovery: RecoverySummarySchema.optional(),
  relevantMemories: z.array(UserMemorySchema),
  constraints: z.array(z.string()),
});
```

Benefits:

- safer AI inputs
- predictable backend
- easier testing
- better Cursor/Codex generation
- less prompt chaos

---

# Intent Router

The AI Orchestrator should classify the user's message into an intent.

Example mapping:

```ts
const intentToSlice = {
  ask_about_today: "daily_checkin",
  adjust_workout: "workout_adaptation",
  adjust_nutrition: "nutrition_adaptation",
  review_progress: "weekly_review",
  ask_health_context: "health_context",
  general: "general_chat",
};
```

The first version can be simple rule-based logic with an LLM fallback.

---

# Example Flow: Workout Adaptation

User:

```text
I feel tired today. Should I train?
```

System:

```text
1. Detect intent: adjust_workout
2. Request context slice: workout_adaptation, 14d, medium
3. Context Engine gathers:
   - current workout plan
   - today workout
   - last 14 days logs
   - sleep/fatigue
   - relevant memories
   - constraints
4. LLM receives typed context
5. LLM recommends adjustment
6. If plan change is needed, create proposal
```

Example proposal:

```json
{
  "type": "workout_plan_change",
  "reason": "Poor sleep and increased fatigue trend",
  "changes": [
    "Replace heavy lower-body session with mobility and core",
    "Move heavy lower-body session to Friday",
    "Reduce today's volume by 40%"
  ]
}
```

---

# Snapshots

The system should save important context summaries.

Examples:

```text
weekly_user_snapshots
monthly_user_snapshots
plan_change_snapshots
```

Table:

```text
user_context_snapshots
- id
- user_id
- type
- period_start
- period_end
- summary_json
- generated_by
- created_at
```

Why snapshots are useful:

- cheaper AI context
- progress tracking
- explainability
- historical analysis
- better weekly/monthly reviews

Example:

```json
{
  "type": "weekly_review",
  "period": "2026-05-18..2026-05-24",
  "summary": {
    "training_adherence": 0.75,
    "nutrition_adherence": 0.68,
    "sleep_avg": 6.5,
    "main_pattern": "User missed workouts after late volleyball sessions.",
    "recommended_adjustment": "Move heavy lower-body training away from volleyball days."
  }
}
```

---

# Privacy and Safety

The agent should only receive the data needed for the task.

Example:

If the user asks:

```text
What should I eat for dinner?
```

Do not include medical documents.

Use:

```text
nutrition_adaptation
```

If the user asks:

```text
Can you consider my blood test?
```

Use:

```text
health_context
document search
structured biomarker facts later
```

Core rules:

```text
Do not expose unnecessary health data.
Do not include documents unless needed.
Do not diagnose.
Do not prescribe medication.
Do not claim to treat diseases.
Use health documents only as context for safe wellness guidance.
```

---

# RAG vs Context Slices

The main source of truth should be structured state in PostgreSQL.

Use RAG only for:

```text
health documents
PDF reports
doctor notes
long user notes
research articles
unstructured content
```

Do not use RAG for:

```text
current workout plan
today checklist
completed workouts
weight trend
nutrition adherence
active goals
```

Those should come from structured DB tools.

Recommended architecture:

```text
PostgreSQL structured state — main source of truth
Backend tools — controlled access
Curated memories — personalization layer
RAG / pgvector — documents and long unstructured context
Context Builder — prepares compact context before AI response
```

---

# Phased Implementation

## Phase 1 — Shared Agent And Context Contracts

Implement shared Zod schemas/types in `packages/types` for:

```text
ContextSlicePurpose
ContextDepth
GetUserContextSliceInput
typed context packets
agent request/response envelopes
tool-call request/result envelopes
context source references and citations
RAG summaries with provenance
safety result metadata
proposal candidate envelopes
```

These contracts should be exported centrally and covered by focused contract tests. Backend, tests, and reviewer agents should treat these contracts as the boundary between chat, orchestration, context assembly, provider output, and proposal creation.

## Phase 2 — Context Engine, Memory, And Snapshots

Implement or wrap the backend context service around:

```text
getUserContextSlice(auth, input)
buildAgentContext(auth, request)
```

The first version should support:

```text
general_chat
daily_checkin
workout_adaptation
nutrition_adaptation
weekly_review
longevity_overview
health_context
```

Reuse existing domain services wherever possible. Add curated memory as structured state for durable preferences, constraints, and behavior patterns. Add context snapshots for weekly, monthly, and plan-change summaries where existing progress/recovery data is not enough.

## Phase 3 — Consent-Gated Documents And RAG

Implement document-aware context retrieval for `health_context` and explicit document-aware turns.

The default path should use safe document summaries, extracted signals, and provenance before any snippet retrieval. Raw documents and raw wellbeing notes should not be passed to the model by default. If vector search is used, returned snippets must be minimized, provenance-tagged, consent-gated, and reviewed through safety constraints.

## Phase 4 — AI Agent Orchestrator And Providers

Implement the AI Agent Orchestrator behind `AiService`.

The orchestrator should include:

```text
provider selection
stub/dev provider
OpenAI provider
missing-key behavior
rule-based intent router
context request builder
tool registry
typed provider output parser
safety result handling
proposal candidate validation
```

The tool registry may expose controlled backend operations such as `getUserContextSlice`, document context retrieval, weekly review retrieval, and proposal candidate creation. Tools must return typed results and must not directly mutate domain tables.

## Phase 5 — Chat Integration

Wire chat turns through the orchestrator while preserving existing safety and proposal behavior.

Required behavior:

```text
wellbeing crisis support bypasses normal generation
unsafe outputs fall back safely
assistant messages include useful metadata
plan changes persist as pending proposals
approved workout/nutrition changes create revisions
frontend changes stay minimal unless metadata rendering is needed
```

## Phase 6 — Tests, Review, And Runtime Verification

Add focused tests for:

```text
schema contracts
context depth and purpose mapping
intent routing
provider selection and missing-key behavior
tool-call validation
document/RAG consent gates
memory inclusion and exclusion
wellbeing note exclusion
proposal provenance
revision-safe proposal acceptance
chat integration through the orchestrator
```

Run narrow validations first, then package/app typechecks where broad contracts or backend integration changed. App Runner should verify the target chat flow locally in stub mode and report the exact remaining step for OpenAI mode.

---

# Recommended Subagent Roles

Use these roles after plan approval:

- Backend Implementer: shared contracts, backend context engine, memory/snapshots, document/RAG retrieval, OpenAI/stub providers, orchestrator, tool registry, and chat integration.
- Test Writer: contract, backend, integration, safety, consent, provider, and proposal-flow tests.
- Implementation Reviewer: architecture fit, security/privacy, prompt/RAG safety, proposal invariants, revision safety, and test coverage.
- App Runner: local stack startup, stub-mode chat verification, runtime status, and exact OpenAI-key follow-up.
- Frontend Implementer: only if chat UI must render citations, context provenance, tool metadata, or proposal links from new assistant message metadata.

Skip by default unless UI scope expands:

- Visual Designer
- Design System Agent
- UI Polish Implementer

---

# Cursor / Agent Rules

Implementation agents should follow these rules:

```text
The AI agent must not retrieve raw user data directly from many services.
All user context must be assembled through typed context engine/tool boundaries.

Use getUserContextSlice for task-specific context.
Use buildAgentContext for full chat-agent turns.

The Context Engine is responsible for:
- selecting relevant data
- aggregating raw records
- generating summaries
- enforcing privacy boundaries
- excluding unnecessary health data
- returning typed context packets
- attaching source references and provenance

Structured state is the source of truth.
Chat is not the source of truth.
RAG is only for documents and long unstructured context.
AI may explain, summarize, and propose.
AI must not directly mutate domain entities.
Plan changes must become typed proposals requiring user approval.
```

---

# Final Summary

The target architecture is:

```text
Chat Turn
  ↓
AI Service / Agent Orchestrator
  ↓
Intent Router + Tool Registry
  ↓
User Context Engine
  ↓
Structured State + Curated Memory + Consent-Gated RAG
  ↓
Typed Agent Context Packet
  ↓
OpenAI or Stub Provider
  ↓
Validated Reply / Tool Result / Proposal Candidate
  ↓
Chat Persistence + Proposal Approval + Revision-Safe Writes
```

The system should give the agent only the context needed for the current task, validate each boundary, and keep all plan-changing behavior behind backend proposals and user approval.

This creates:

- a practical path to real OpenAI-backed coaching
- safer personalization
- lower prompt/data exposure risk
- predictable tests and review boundaries
- better long-term architecture for context, RAG, memory, and proposals
