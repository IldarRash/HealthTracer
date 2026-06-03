# Product Overview

Core product and architecture invariants for the AI Health Coach. **Always applies.**

- AI Health Coach is for wellness, fitness, tracking, and coaching.
- The product must not generate diagnosis or medical treatment guidance.
- Chat is an interaction layer, not the source of truth.
- Structured state is authoritative for plans, goals, metrics, and progress.
- AI creates typed proposals; backend services validate and apply changes.
- Workout and nutrition changes must create revisions instead of overwriting plan state.
- Keep architecture and feature roadmap in `docs`; keep the Claude operating layer in `.claude` (mirrored from `.cursor`).
