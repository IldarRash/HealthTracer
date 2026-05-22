# Auth Decision

## Recommendation For MVP

Use Clerk for MVP auth unless a later product constraint requires self-hosted auth.

## Why Clerk

- Good support for Expo and Next.js.
- Backend can verify JWTs in NestJS.
- Faster path to onboarding and protected API routes.
- Avoids building password reset, sessions, and account security before the product loop is proven.

## Alternatives

- Better Auth: attractive for TypeScript ownership, but requires more integration work across Expo, Next.js, and NestJS.
- Auth.js: strong for web, less direct for mobile-first Expo flows.
- Supabase Auth: good if Supabase becomes the primary platform, but the current database plan targets Railway Postgres and Drizzle ownership.

## MVP Boundary

- Auth provider owns identity.
- Application database owns user profile, goals, preferences, and health constraints.
- Do not store provider secrets in repository files.
- API modules should rely on a single auth guard or middleware boundary.

## Revisit When

- Self-hosting becomes a requirement.
- Pricing or vendor lock-in becomes a product constraint.
- Enterprise SSO or advanced account linking is needed.
