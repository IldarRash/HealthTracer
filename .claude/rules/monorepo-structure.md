# Monorepo Structure

Applies when working in `apps/**` or `packages/**`.

- Use Turborepo, pnpm workspaces, and TypeScript.
- Application code belongs in `apps/*`; reusable code belongs in `packages/*`.
- Do **not** import directly from one app into another app — share via `packages/*`.
- Shared contracts and Zod schemas belong in `packages/types`.
- Drizzle schema and migrations belong in `packages/db`.
- Prompt helpers, tool schemas, proposal helpers, and the stub provider belong in `packages/ai`.
- File-backed AI/chat + attachment behavior config belongs in `packages/ai-behavior`.
- Shared TypeScript, lint, and env validation config belongs in `packages/config`.
