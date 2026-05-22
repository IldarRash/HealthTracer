# AI Health Coach MVP Scope

## Product Thesis

AI Health Coach is not a chatbot with fitness advice. It is a stateful coaching system where chat is the interaction layer and structured state is the source of truth.

The broader product roadmap is defined in `docs/product/feature-roadmap.md`. MVP 1 should build the smallest trustworthy version of that roadmap: chat, structured plans, completion tracking, and safe AI proposals.

The MVP must prove one loop:

```text
Plan -> execution -> feedback -> AI proposal -> validated revision -> updated plan
```

## MVP 1 Goal

MVP 1 should help a user define goals, receive an initial workout and nutrition plan, track daily execution, and let the AI propose safe structured adaptations based on feedback.

## In Scope

- Auth, user profile, goals, onboarding, preferences, and basic constraints.
- Coach chat as a planning and feedback interface.
- User-approved AI proposal flow before plan changes are applied.
- Workout plans with revision history and completion tracking.
- Nutrition targets with calories, macros, preferences, restrictions, and adherence tracking.
- Daily checklist and Today dashboard.
- Basic AI adaptation through structured proposals validated by the backend.
- Mobile-first UX with a minimal web surface for debugging or admin visibility.

## Out Of Scope

- Medical diagnosis or treatment recommendations.
- HealthKit, Health Connect, wearables, and recovery scoring.
- Uploading health documents, OCR, semantic search, and RAG.
- Advanced analytics and experimentation.
- Realtime collaboration.
- Separate Python AI service.
- Microservices.

## MVP 2

- Recipe database and recipe recommendations connected to nutrition targets.
- Apple HealthKit and Android Health Connect.
- Steps, sleep, weight, workouts, and recovery inputs.
- Granular permissions and explicit consent flows.

## MVP 3

- Health document upload.
- OCR and AI summarization.
- Semantic search and document RAG.
- Stronger privacy controls for sensitive health documents.

## Later Roadmap

- Weekly progress reviews and trend-based adaptation.
- Richer analytics across adherence, recovery, workouts, nutrition, and synced metrics.
- Expanded recipe personalization and meal planning.
- Web/admin surfaces for debugging state, proposals, revisions, and sync health.

## Product Guardrails

- Chat must never become the source of truth.
- AI must create proposals, not mutate persisted entities directly.
- User approval is required before AI-generated plan changes are applied.
- Every plan change must be auditable through revisions.
- The app is for wellness, fitness, tracking, and coaching, not medical care.
