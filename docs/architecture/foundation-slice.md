# Slice 1: Repository Foundation

## Goal

Create the monorepo foundation without implementing product domains yet.

## Target Structure

```text
apps/
  api/
  mobile/
  web/

packages/
  ai/
  config/
  db/
  types/
  ui/
```

## Tooling

- `pnpm` for package management.
- Turborepo for workspace tasks.
- TypeScript everywhere.
- Shared ESLint and TypeScript config in `packages/config`.
- Environment validation before app startup.

## Apps

### `apps/api`

- NestJS.
- REST API first.
- Health endpoint.
- Auth guard placeholder wired for Clerk JWT verification.
- Domain modules added only in later slices.

### `apps/mobile`

- Expo with Expo Router.
- NativeWind.
- TanStack Query.
- Clerk Expo integration.
- Initial route shell only.

### `apps/web`

- Next.js App Router.
- Tailwind.
- shadcn/ui-compatible component setup.
- TanStack Query if client API state is needed.
- Primary web product shell for Chat, Today, Longevity, and Profile.
- Secondary read-only Training and Nutrition plan views.

## Packages

### `packages/db`

- Drizzle ORM and Drizzle Kit.
- PostgreSQL schema entry point.
- Migration directory.
- No production database access in committed files.

### `packages/types`

- Shared Zod schemas.
- API request and response contracts.
- Domain enum definitions.

### `packages/ai`

- Prompt helpers.
- AI tool schemas.
- Shared proposal types.

### `packages/ui`

- Shared design tokens and primitives after the first UI patterns stabilize.

### `packages/config`

- Shared tsconfig.
- Shared eslint config.
- Env schema utilities.

## Local Database

Start with one of two options:

- Docker Postgres for local development.
- Dedicated Railway development Postgres if Docker is not convenient on the machine.

Use `DATABASE_URL` from local environment only. Do not commit real connection strings.

## First Validation Commands

After implementation, the foundation should support:

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm dev
```

Exact scripts can be adjusted to match generated framework defaults.

## Done Criteria

- Workspace installs successfully.
- Each app has a minimal boot path.
- Shared packages compile.
- Database package can generate migrations.
- Env examples exist without secrets.
- Cursor rules and skills are present before feature work starts.
