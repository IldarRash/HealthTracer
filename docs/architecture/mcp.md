# MCP Setup

## Goals

MCP should improve agent accuracy without adding unnecessary operational risk.

Use MCP for:

- Current framework documentation.
- Development database introspection.
- Safer architecture and migration review.

Do not use MCP as a shortcut around application code, migrations, permissions, or review.

## Context7

Use Context7 for current, version-aware documentation while implementing:

- Next.js App Router
- Expo and Expo Router
- NestJS
- Drizzle ORM and Drizzle Kit
- Zod
- TanStack Query
- OpenAI SDK or Vercel AI SDK
- Tailwind, NativeWind, and shadcn/ui

Recommended behavior:

- Ask for docs for the exact library before adding unfamiliar APIs.
- Prefer official package documentation surfaced through Context7 over memory.
- Keep architecture decisions in repository docs, not only in MCP context.

## Postgres MCP

Use Postgres MCP only after a development database exists.

Allowed:

- Schema introspection in local or staging environments.
- Read-only queries for debugging.
- `EXPLAIN` on development queries.
- Migration review assistance.

Not allowed:

- Production write access.
- Destructive commands without explicit approval.
- Manual schema changes that bypass Drizzle migrations.
- Queries exposing sensitive health data to logs or chat unnecessarily.

## Suggested Cursor MCP Template

Keep real API keys and database URLs out of git. Use a local untracked config or environment variables.

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"],
      "env": {
        "CONTEXT7_API_KEY": "${CONTEXT7_API_KEY}"
      }
    },
    "postgres-dev": {
      "command": "postgres-mcp",
      "args": ["--readonly"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

## Activation Timing

- Context7 can be enabled immediately.
- Postgres MCP should wait until Slice 1 creates local database configuration.
- Production database MCP should remain disabled until a security review says otherwise.
