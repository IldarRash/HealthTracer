# ADR 0001: TypeScript Monorepo And Modular Monolith

## Status

Accepted for MVP.

## Context

The product needs mobile, web, API, shared domain contracts, database migrations, and AI tooling. The team also needs Cursor agents to understand the system quickly and make small vertical changes safely.

Starting with microservices would increase deployment, debugging, and schema coordination cost before the product loop is proven.

## Decision

Use a TypeScript monorepo with Turborepo and pnpm.

Use a NestJS modular monolith for the backend.

Keep shared code in packages:

- `packages/db`
- `packages/types`
- `packages/ui`
- `packages/ai`
- `packages/config`

## Consequences

Positive:

- One repository contains the full vertical slice.
- Shared Zod contracts reduce drift between clients and API.
- Drizzle migrations are easy to review with application changes.
- Cursor rules and skills can describe the whole system consistently.

Trade-offs:

- Package boundaries must be enforced by convention and linting.
- Backend modules must stay modular to avoid a large unstructured API.
- Mobile and web should not import app-specific code from each other.

## Revisit When

- Deployment bottlenecks slow independent teams.
- A domain needs independent scaling.
- The backend becomes difficult to test or reason about.
- Operational cost of the monolith exceeds its simplicity benefits.
