---
name: frontend-implementation
description: Implement frontend feature slices in Next.js and Expo with React, TanStack Query, shared contracts, forms, navigation, and UI states. Use for web pages, mobile screens, and client integration work.
disable-model-invocation: true
---

# Frontend Implementation

## Workflow

1. Confirm whether the feature belongs to web, mobile, or both.
2. Read the relevant product slice and shared contracts.
3. Implement routes or screens with Next.js App Router or Expo Router.
4. Use TanStack Query for server state and shared schemas from `packages/types`.
5. Add loading, error, empty, and success states.
6. Keep business logic in backend services or shared pure helpers.
7. Run the narrowest useful frontend typecheck, lint, or test command.

## Rules

- Mobile is the primary MVP experience.
- Web starts as a minimal debug, admin, or future desktop surface.
- Do not add HealthKit or Health Connect in MVP 1.
- Do not change backend domain rules without an explicit backend task.
