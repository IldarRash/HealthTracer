# AI Health Coach

TypeScript monorepo for the AI Health Coach product.

## Workspace

```text
apps/api      NestJS REST API
apps/mobile   Expo mobile shell
apps/web      Next.js web shell
packages/ai   AI prompt and tool schema placeholders
packages/config shared TypeScript and env helpers
packages/db   Drizzle schema and migrations
packages/types shared Zod contracts
packages/ui   shared UI tokens placeholder
```

## Local setup

Install dependencies from the repository root:

```text
pnpm install
```

Copy the example env files and fill in local values only:

```text
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
```

Do not commit real API keys, database URLs, tokens, or private health data.

Start local Postgres (Docker Compose):

```text
pnpm db:up
```

Apply Drizzle migrations:

```text
pnpm db:migrate
```

Run the dev stack:

```text
pnpm dev
```

- API: `http://localhost:3000`
- Web: `http://localhost:3001`

Stop Postgres when finished:

```text
pnpm db:down
```

## Clerk

Protected API routes and the web app require a Clerk application.

- API: set `CLERK_JWKS_URL` in `apps/api/.env` to your Clerk JWKS URL (`https://<your-clerk-domain>/.well-known/jwks.json`).
- Web: set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `apps/web/.env` from the [Clerk dashboard](https://dashboard.clerk.com/last-active?path=api-keys).

Without Clerk credentials, lint/typecheck still run, but authenticated API and web flows will not work end to end.

## Validation

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Generate new Drizzle migrations after schema changes:

```text
pnpm --filter @health/db db:generate
```

## Scope

Phases 1–4 are implemented for API and web: foundation, auth/profile/goals, chat with proposal approval, and partial workout plans. See `docs/product/phase-audit.md` for the current roadmap status. Mobile auth, daily execution UI, nutrition UI, and later roadmap phases remain in progress or not started.
