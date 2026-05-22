# AI Health Coach — Product & Architecture Plan for Cursor

## Vision

Build an AI-first health and fitness platform where:

- AI acts as a personal coach and planner.
- Chat is only the interaction layer.
- Structured state is the source of truth.
- Workout, nutrition, and health plans evolve over time.
- Users track progress with checkpoints and daily feedback.
- AI adapts recommendations based on real behavior and data.

The system should feel like a combination of:

- ChatGPT
- Notion
- WHOOP
- Linear
- Personal fitness coach

---

# Core Product Philosophy

## Chat is NOT the source of truth

Chat should only be:

- conversational interface
- planning interface
- coaching interface
- feedback interface

The real source of truth must be structured state.

---

# Main System Principle

```text
User message
  ↓
AI interprets intent
  ↓
AI proposes structured changes
  ↓
Backend validates changes
  ↓
Plan revision created
  ↓
UI updates automatically
```

AI should never directly mutate database entities.

---

# Main Product Areas

## 1. Coach Chat

Main conversational interface.

Responsibilities:

- communicate with user
- understand goals
- adapt plans
- collect feedback
- explain recommendations
- generate motivation
- answer questions

Chat should feel persistent and contextual.

---

## 2. Training

Structured workout planning system.

Features:

- workout plans
- workout days
- exercises
- sets/reps/rest
- progressive overload
- completion tracking
- post-workout feedback
- plan adaptation

Workout plans must support versioning.

---

## 3. Nutrition

Structured nutrition planning system.

Features:

- calorie targets
- macros
- meals
- meal templates
- adherence tracking
- hydration tracking
- food preferences
- dietary restrictions

Nutrition plans must support revisions.

---

## 4. Health

User health state.

Features:

- weight
- sleep
- steps
- recovery
- injuries
- allergies
- wearable integrations
- uploaded health documents

The platform should not generate diagnoses.

The platform is for:

- wellness
- fitness
- optimization
- tracking
- coaching

It is not for medical treatment.

---

## 5. Daily System

Core retention loop.

Features:

- checkpoints
- daily habits
- streaks
- adherence scoring
- progress feedback
- AI follow-up

Main loop:

```text
Plan
→ Execution
→ Feedback
→ Adaptation
→ Updated Plan
```

---

# Fixed Technical Stack for MVP

## Monorepo

- Turborepo
- pnpm
- TypeScript everywhere

## Apps

```text
apps/mobile  → Expo + React Native + TypeScript
apps/web     → Next.js + TypeScript
apps/api     → NestJS + TypeScript
```

## Packages

```text
packages/db          → Drizzle ORM + migrations
packages/types       → shared DTOs, Zod schemas, API contracts
packages/ui          → design tokens + shared components
packages/ai          → prompts, tools, structured outputs
packages/config      → eslint, tsconfig, env validation
packages/health-sync → HealthKit / Health Connect abstraction later
```

## Backend

- NestJS
- Modular Monolith
- REST API first
- OpenAPI later
- Zod validation for AI outputs and user inputs
- Drizzle ORM
- PostgreSQL

## Frontend Web

- Next.js App Router
- React
- Tailwind
- shadcn/ui
- TanStack Query

## Mobile

- Expo
- React Native
- Expo Router
- NativeWind
- TanStack Query
- Expo SecureStore

## Database

- PostgreSQL on Railway
- Drizzle ORM
- Drizzle Kit migrations

## Hosting

- Railway for API
- Railway PostgreSQL
- Railway Redis later if needed
- Web can be Railway or Vercel
- Mobile builds through Expo EAS later

## AI

Start inside the API app:

```text
apps/api/src/modules/ai
```

Use:

- OpenAI SDK or Vercel AI SDK
- Zod structured outputs
- tool calling
- proposal-based updates
- revision-safe plan changes

Do not start with a separate Python AI service.

---

# Repository Structure

```text
ai-health-coach/

  apps/
    mobile/
    web/
    api/

  packages/
    db/
    ui/
    types/
    ai/
    config/
    health-sync/

  docs/
    architecture/
    product/
    ai/
      skills/

  .cursor/
    rules/

  docker/
```

---

# Architecture Style

## Modular Monolith

Do not start with microservices.

Reasons:

- faster development
- lower infrastructure complexity
- easier debugging
- easier AI understanding
- easier refactoring
- lower operational cost

Move to microservices only if:

- team scales significantly
- deployment bottlenecks appear
- scaling bottlenecks appear
- organizational complexity increases

---

# Main Domains

```text
User
Goals
Chat
WorkoutPlan
WorkoutSession
NutritionPlan
MealLog
DailyChecklist
HealthMetric
HealthDocument
Recommendation
PlanRevision
```

---

# Workout System Design

## Important Rule

Workout plans must be versioned.

Correct:

```text
WorkoutPlan
 ├── Revision 1
 ├── Revision 2
 ├── Revision 3
```

Not mutable direct updates.

Reasons:

- AI changes plans often
- rollback support
- auditability
- progress tracking
- experimentation

---

# AI Update Model

AI should create structured intents.

Example:

```json
{
  "intent": "adjust_workout_intensity",
  "reason": "fatigue",
  "changes": {
    "volume_multiplier": 0.8
  }
}
```

Backend validates and applies changes.

---

# Memory System

The platform should use 3 memory layers.

## 1. Structured Memory

Main source of truth.

Examples:

- weight
- goals
- completed workouts
- nutrition adherence
- injuries
- sleep
- habits

## 2. Conversational Memory

Recent chat context.

Examples:

- user mood
- short-term plans
- recent feedback
- temporary discussions

## 3. Semantic Memory / RAG

For uploaded documents and knowledge retrieval.

Examples:

- PDFs
- blood tests
- health reports
- research documents

Semantic memory should not replace structured memory.

---

# Mobile-First Strategy

The product should be designed mobile-first.

Reason:

- daily interaction
- habit tracking
- notifications
- wearable integrations
- HealthKit access
- Health Connect access

---

# Health Integrations

## iOS

Use Apple HealthKit.

Potential integrations:

- steps
- workouts
- sleep
- heart rate
- calories
- weight

Permissions must be granular.

## Android

Use Health Connect.

Potential integrations:

- steps
- sleep
- workouts
- nutrition
- calories
- weight
- heart rate

Do not use legacy Google Fit strategy.

---

# UI/UX Principles

## Main Navigation

```text
1. Coach
2. Today
3. Training
4. Nutrition
5. Health
6. Progress
7. Documents
```

## Main Screen

The main screen should combine:

- AI coach
- daily tasks
- workout status
- nutrition progress
- recovery state
- checkpoints

The user should instantly understand:

- what to do today
- what is completed
- what is missing
- how AI adapted the plan

---

# AI Tooling

Recommended tools:

```text
createWorkoutPlan
updateWorkoutPlan
createNutritionPlan
updateNutritionPlan
createDailyChecklist
summarizeProgress
adaptPlanBasedOnFeedback
```

Tools should generate:

- structured outputs
- validated schemas
- revision-safe updates

---

# Reference Repositories to Study

## 1. Turborepo official examples

Use them to understand:

- monorepo structure
- shared packages
- Next.js integration
- React Native + Next.js setup
- NestJS examples
- build pipelines

What to copy:

- apps/packages separation
- shared UI approach
- turbo tasks
- package boundaries

---

## 2. nextjs-nestjs-expo-template

A useful reference for:

- Next.js + NestJS + Expo in one monorepo
- full-stack TypeScript setup
- cross-platform project layout
- typed shared code

What to copy:

- app separation
- shared types
- mobile/web/api boundaries

What not to blindly copy:

- exact architecture
- all dependencies
- realtime parts unless needed

---

## 3. awesome-cursorrules

Use it as inspiration for Cursor rules.

What to copy:

- `.cursor/rules/*.mdc` structure
- project-specific instructions
- framework-specific coding rules
- architecture conventions

Do not copy random rules directly. Adapt them to this stack.

---

## 4. cursor-security-rules

Use for AI safety and secure development rules.

What to copy:

- secret handling rules
- no unsafe shell commands
- no destructive DB operations without explicit approval
- no logging sensitive user data
- safe dependency installation rules

---

## 5. everything-claude-code

Use as inspiration for an agent harness.

Main ideas to adapt:

- skills
- memory
- security rules
- research-first workflow
- task-specific instructions
- agent behavior optimization

How to adapt for Cursor:

- keep project rules in `.cursor/rules`
- keep reusable workflows in `docs/ai/skills`
- keep architecture context in `docs/architecture`
- keep product decisions in `docs/product`

---

# Cursor Setup for This Project

## Recommended Structure

```text
.cursor/
  rules/
    000-project-overview.mdc
    100-monorepo-structure.mdc
    200-backend-nestjs.mdc
    210-database-drizzle.mdc
    220-ai-orchestrator.mdc
    300-web-nextjs.mdc
    310-mobile-expo.mdc
    400-testing.mdc
    500-security.mdc

AGENTS.md

docs/
  architecture/
    overview.md
    domain-model.md
    ai-update-flow.md
    database.md

  product/
    vision.md
    mvp-scope.md
    user-flows.md

  ai/
    skills/
      create-domain-module.md
      create-drizzle-migration.md
      create-ai-tool.md
      create-mobile-screen.md
      create-web-page.md
      write-tests.md
      review-security.md
```

---

# Cursor Rules vs Skills

## Cursor Rules

Use for always-on context.

Examples:

- project architecture
- stack decisions
- folder structure
- code style
- naming conventions
- security constraints
- domain rules

## Skills

Use for repeatable workflows.

Examples:

- create new NestJS domain module
- add Drizzle table and migration
- create AI tool with Zod schema
- add mobile screen
- write integration tests
- review pull request

---

# Recommended Cursor Rules

## 000-project-overview.mdc

Should say:

- This is an AI Health Coach app.
- Chat is not source of truth.
- Structured state is source of truth.
- AI creates proposals, backend validates.
- Plans must be revision-safe.
- No diagnosis generation.

## 100-monorepo-structure.mdc

Should enforce:

- apps only contain application code.
- packages contain reusable code.
- no cross-imports between apps.
- shared contracts live in packages/types.
- DB schema lives in packages/db.

## 200-backend-nestjs.mdc

Should enforce:

- every domain is a NestJS module.
- controllers are thin.
- services contain application logic.
- repositories handle DB access.
- DTOs are validated.
- no direct AI mutation of DB.

## 210-database-drizzle.mdc

Should enforce:

- all schema changes go through Drizzle migrations.
- no manual production DB changes.
- use explicit relations.
- use timestamps.
- use revision tables for plans.
- avoid storing sensitive health docs in plain DB fields.

## 220-ai-orchestrator.mdc

Should enforce:

- AI outputs must be structured.
- all AI outputs validated by Zod.
- AI tools create proposals, not direct mutations.
- every plan update creates a revision.
- AI must explain major plan changes.

## 300-web-nextjs.mdc

Should enforce:

- App Router.
- server/client components intentionally separated.
- shadcn/ui style components.
- TanStack Query for API state.
- no business logic in components.

## 310-mobile-expo.mdc

Should enforce:

- Expo Router.
- NativeWind.
- mobile-first UX.
- offline-tolerant checklist interactions later.
- no HealthKit/Health Connect until MVP 2.

## 400-testing.mdc

Should enforce:

- unit tests for domain services.
- integration tests for API modules.
- AI output schema tests.
- migration tests where useful.

## 500-security.mdc

Should enforce:

- no secrets in code.
- no sensitive logs.
- encrypted document storage later.
- explicit user consent for health data.
- no diagnosis wording.
- no destructive operations without approval.

---

# Recommended Skills

## create-domain-module.md

Workflow:

1. Create NestJS module.
2. Add controller.
3. Add service.
4. Add repository.
5. Add DTO/Zod schemas.
6. Add tests.
7. Update exports.

Use for:

- workout
- nutrition
- health
- documents
- checklist
- chat

---

## create-drizzle-migration.md

Workflow:

1. Update schema in packages/db.
2. Generate migration.
3. Add relations.
4. Add indexes.
5. Add seed data if needed.
6. Run local migration.
7. Update shared types.

---

## create-ai-tool.md

Workflow:

1. Define tool purpose.
2. Define input schema with Zod.
3. Define output schema with Zod.
4. Add backend validation.
5. Return proposal object.
6. Add tests.
7. Add audit/revision behavior if needed.

---

## create-mobile-screen.md

Workflow:

1. Create Expo route.
2. Add screen component.
3. Use shared API client.
4. Use TanStack Query.
5. Use design system components.
6. Add loading/error/empty states.

---

## review-security.md

Workflow:

1. Check secrets.
2. Check logs.
3. Check health data exposure.
4. Check auth boundaries.
5. Check destructive operations.
6. Check AI-generated unsafe behavior.

---

# Agent Coding Approach

## Best Default Flow

```text
1. Ask Cursor to create a short plan.
2. Ask it to inspect relevant files.
3. Ask it to make the smallest safe change.
4. Ask it to run tests/typecheck.
5. Ask it to summarize changed files.
6. Review diff manually.
```

## Best Prompt Pattern

```text
Use the project rules.
Implement this as a minimal vertical slice.
Do not redesign unrelated code.
Keep backend logic inside the correct domain module.
Use Drizzle for DB access.
Use Zod for validation.
AI outputs must be structured proposals.
Add or update tests.
Show me the final diff summary.
```

---

# What to Avoid with Cursor

Avoid prompts like:

```text
Build the whole app.
Create all features.
Make it production-ready.
Refactor everything.
```

Better:

```text
Create the workout plan domain vertical slice:
DB schema → API endpoint → service → mobile screen → tests.
```

---

# MVP Plan

## MVP 1

Build only:

- onboarding
- chat
- workout plans
- nutrition plans
- checkpoints
- daily dashboard
- completion tracking
- revision system
- basic AI adaptation

Do not build yet:

- deep medical features
- document RAG
- advanced analytics
- wearables initially

---

## MVP 2

Add:

- Apple HealthKit
- Android Health Connect
- steps
- sleep
- weight
- recovery tracking

---

## MVP 3

Add:

- health document upload
- OCR
- AI summarization
- semantic search
- RAG memory

Still avoid:

- diagnosis generation
- medical treatment claims

---

# First Implementation Slices

## Slice 1 — Foundation

- Turborepo
- pnpm
- apps/api
- apps/web
- apps/mobile
- packages/db
- packages/types
- Railway Postgres

## Slice 2 — User + Auth

- auth provider
- user profile
- goals onboarding

## Slice 3 — Workout Plan

- workout plan schema
- workout plan revision schema
- create plan API
- view plan mobile screen

## Slice 4 — Daily Checklist

- daily checklist schema
- mark item done
- Today screen

## Slice 5 — AI Coach

- chat endpoint
- streaming response
- create structured proposal
- apply workout plan revision

---

# Biggest Product Insight

The product is not an AI chatbot.

It is:

## A Stateful Adaptive Health Operating System

The value comes from:

- continuity
- adaptation
- accountability
- memory
- long-term evolution
- behavior tracking

Not from text generation alone.

---

# Key Product Goal

The user should feel:

```text
This system understands my goals,
remembers my progress,
and evolves with me every day.
```

---

# Final Recommendation

Focus on:

- fast iteration
- mobile-first UX
- structured state
- revision-safe plans
- strong daily loop
- AI orchestration
- simplicity

Avoid:

- overengineering
- premature microservices
- too many agents
- unnecessary infrastructure complexity
- diagnosis positioning
